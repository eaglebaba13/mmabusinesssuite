/** Private S3-only Unix relay. MinIO verifies forwarded SigV4 signatures. */
import http from "node:http";
import net from "node:net";
import { lstat, unlink, chmod } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const buckets = new Set([
  "brand-logos",
  "franchisee-docs",
  "invoice-sources",
  "official-documents",
  "product-media",
  "roi-claims",
]);
const objectOperations = {
  GET: "GetObject",
  HEAD: "HeadObject",
  PUT: "PutObject",
  DELETE: "DeleteObject",
};

export function permittedRequest(method, target, authorization, accessKeyId) {
  if (!authorization?.startsWith(`AWS4-HMAC-SHA256 Credential=${accessKeyId}/`)) return false;
  if (!target?.startsWith("/") || target.startsWith("//") || target.includes("#")) return false;
  let url, bucket, key;
  try {
    url = new URL(target, "http://relay.invalid");
    const parts = url.pathname.slice(1).split("/");
    bucket = decodeURIComponent(parts.shift());
    key = decodeURIComponent(parts.join("/"));
  } catch {
    return false;
  }
  if (
    !buckets.has(bucket) ||
    key.split("/").some((part) => part === ".." || part === ".") ||
    key.includes("\0")
  )
    return false;
  const params = url.searchParams;
  const allowed = key
    ? new Set(["x-id"])
    : new Set(["x-id", "list-type", "prefix", "continuation-token", "encoding-type"]);
  if ([...params.keys()].some((name) => !allowed.has(name) || params.getAll(name).length !== 1))
    return false;
  if (key)
    return (
      method in objectOperations &&
      (!params.has("x-id") || params.get("x-id") === objectOperations[method])
    );
  if (method === "HEAD")
    return (
      [...params.keys()].every((name) => name === "x-id") &&
      (!params.has("x-id") || params.get("x-id") === "HeadBucket")
    );
  return (
    method === "GET" &&
    params.get("list-type") === "2" &&
    (!params.has("x-id") || params.get("x-id") === "ListObjectsV2")
  );
}

export async function startRelay({ socketPath, accessKeyId }) {
  if (
    !socketPath?.startsWith("/") ||
    socketPath.includes("\0") ||
    Buffer.byteLength(socketPath) > 107 ||
    !accessKeyId
  )
    throw new Error("Private relay configuration missing or invalid");
  try {
    const existing = await lstat(socketPath);
    if (!existing.isSocket() || existing.uid !== process.getuid())
      throw new Error("Unsafe existing socket path");
    const active = await new Promise((resolve, reject) => {
      const probe = net.connect({ path: socketPath });
      probe.setTimeout(1000, () => {
        probe.destroy();
        reject(new Error("Existing socket check timed out"));
      });
      probe.once("connect", () => {
        probe.destroy();
        resolve(true);
      });
      probe.once("error", (error) =>
        error.code === "ECONNREFUSED" ? resolve(false) : reject(error),
      );
    });
    if (active) throw new Error("Private relay already running");
    await unlink(socketPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  process.umask(0o077);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 16 });
  const server = http.createServer({ maxHeaderSize: 16384 }, (request, response) => {
    if (
      !permittedRequest(request.method, request.url, request.headers.authorization, accessKeyId)
    ) {
      response.writeHead(403, { "content-type": "application/xml", connection: "close" });
      response.end("<Error><Code>AccessDenied</Code></Error>");
      return;
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 9000,
        method: request.method,
        path: request.url,
        headers: request.headers,
        agent,
      },
      (reply) => {
        response.writeHead(reply.statusCode, reply.headers);
        reply.on("error", () => response.destroy());
        reply.pipe(response);
      },
    );
    upstream.setTimeout(120000, () => upstream.destroy());
    upstream.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(502);
        response.end("Private storage unavailable");
      } else response.destroy();
    });
    request.on("aborted", () => upstream.destroy());
    response.on("close", () => {
      if (!response.writableFinished) upstream.destroy();
    });
    request.pipe(upstream);
  });
  server.on("upgrade", (_request, socket) => socket.destroy());
  server.on("connect", (_request, socket) => socket.destroy());
  server.requestTimeout = 120000;
  server.headersTimeout = 30000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  await chmod(socketPath, 0o600);
  return {
    server,
    close: async () => {
      agent.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      try {
        await unlink(socketPath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const relay = await startRelay({
      socketPath: process.env.MINIO_SOCKET_PATH,
      accessKeyId: process.env.MINIO_ALLOWED_ACCESS_KEY,
    });
    for (const signal of ["SIGTERM", "SIGINT"])
      process.once(signal, () => relay.close().then(() => process.exit(0)));
    console.log("Private S3 Unix relay ready");
  } catch {
    console.error("Private S3 Unix relay failed to start");
    process.exitCode = 1;
  }
}
