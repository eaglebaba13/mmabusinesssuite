/** Server-only controlled file delivery. Tickets never expose S3 URLs or credentials. */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  assertStorageAccess,
  canAccessStorage,
  StorageError,
  storageBucket,
  storagePath,
  type StorageActor,
} from "./storage-policy.ts";
import { createMinioBackend, type StorageBackend } from "./storage.server.ts";
import { authenticateStorageRequest, resolveStorageTicketUser } from "./storage-auth.server.ts";

export const MAX_FILE_ACCESS_SECONDS = 3600;
type Ticket = {
  v: 1;
  userId: string;
  bucket: string;
  path: string;
  expiresAt: number;
  issuedAt: number;
  download?: string;
};
type Dependencies = {
  backend?: StorageBackend;
  authenticate?: (request: Request, path: string) => Promise<StorageActor>;
  resolveTicketUser?: (userId: string, path: string) => Promise<StorageActor>;
  signingKey?: () => string;
  now?: () => number;
};
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
function signingKey() {
  const secret = process.env.MINIO_SECRET_KEY;
  if (!secret) throw new StorageError(503, "Private storage is not configured");
  return createHmac("sha256", secret).update("MMA controlled file access v1").digest("hex");
}
function signTicket(payload: Ticket, key: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}
function verifyTicket(value: string, key: string, now: number): Ticket {
  if (value.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))
    throw new StorageError(403, "Invalid file access link");
  const [body, supplied] = value.split(".");
  const expected = createHmac("sha256", key).update(body).digest();
  const signature = Buffer.from(supplied, "base64url");
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected))
    throw new StorageError(403, "Invalid file access link");
  let data: Ticket;
  try {
    data = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    throw new StorageError(403, "Invalid file access link");
  }
  if (
    data.v !== 1 ||
    typeof data.userId !== "string" ||
    !data.userId ||
    !Number.isSafeInteger(data.expiresAt) ||
    !Number.isSafeInteger(data.issuedAt) ||
    data.expiresAt <= now ||
    data.issuedAt > now ||
    data.expiresAt - data.issuedAt > MAX_FILE_ACCESS_SECONDS ||
    data.expiresAt <= data.issuedAt ||
    (data.download !== undefined && typeof data.download !== "string")
  ) {
    throw new StorageError(403, "File access link expired or invalid");
  }
  storageBucket(data.bucket);
  storagePath(data.path);
  return data;
}
async function boundedBody(request: Request, maximum: number): Promise<Uint8Array> {
  const stated = request.headers.get("content-length");
  if (stated && (!/^\d+$/.test(stated) || Number(stated) > maximum))
    throw new StorageError(413, "File or request is too large");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new StorageError(413, "File or request is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
function attachmentName(value: string) {
  // eslint-disable-next-line no-control-regex -- Explicitly reject/strip filename control characters.
  return value.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 180) || "download";
}

export function createStorageHandler(dependencies: Dependencies = {}) {
  const authenticate = dependencies.authenticate ?? authenticateStorageRequest;
  const resolveTicketUser = dependencies.resolveTicketUser ?? resolveStorageTicketUser;
  const key = dependencies.signingKey ?? signingKey;
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));
  let instance = dependencies.backend;
  const backend = () => (instance ??= createMinioBackend());
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (["PUT", "POST"].includes(request.method)) {
        const origin = request.headers.get("origin");
        if (origin && origin !== url.origin)
          throw new StorageError(403, "Cross-origin file operation denied");
      }
      const ticket = url.searchParams.get("ticket");
      let bucket, path, actor, download: string | undefined;
      if (ticket) {
        if (request.method !== "GET" && request.method !== "HEAD")
          throw new StorageError(403, "Read-only file access link");
        const payload = verifyTicket(ticket, key(), now());
        bucket = storageBucket(payload.bucket);
        path = storagePath(payload.path);
        download = payload.download;
        actor = await resolveTicketUser(payload.userId, path);
        if (actor.userId !== payload.userId) throw new StorageError(403, "File access denied");
      } else {
        bucket = storageBucket(url.searchParams.get("bucket"));
        path = storagePath(url.searchParams.get("path"), request.method === "POST");
        actor = await authenticate(request, path);
      }
      if (request.method === "GET" || request.method === "HEAD") {
        assertStorageAccess(actor, bucket, path, "read");
        storagePath(path);
        if (request.method === "HEAD") {
          if (!(await backend().exists(bucket, path)))
            throw new StorageError(404, "File not found");
          return new Response(null, { headers: PRIVATE_HEADERS });
        }
        const range = request.headers.get("range") ?? undefined;
        if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
          throw new StorageError(416, "Invalid file range");
        const file = await backend().get(bucket, path, range);
        const name = attachmentName(download || path.split("/").at(-1) || "download");
        const headers: Record<string, string> = {
          ...PRIVATE_HEADERS,
          "Content-Type": file.contentType || "application/octet-stream",
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
          "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'self'",
          "X-Frame-Options": "SAMEORIGIN",
          "Accept-Ranges": "bytes",
        };
        if (file.size !== undefined) headers["Content-Length"] = String(file.size);
        if (file.contentRange) headers["Content-Range"] = file.contentRange;
        return new Response(file.body, { status: file.contentRange ? 206 : 200, headers });
      }
      if (request.method === "PUT") {
        assertStorageAccess(actor, bucket, path, "insert");
        const upsert = url.searchParams.get("upsert") === "true";
        // Supabase upsert requires SELECT and UPDATE permissions as well as INSERT.
        if (upsert) {
          assertStorageAccess(actor, bucket, path, "read");
          assertStorageAccess(actor, bucket, path, "update");
        }
        const contentType = request.headers.get("content-type") || "application/octet-stream";
        if (!/^[\w.+-]+\/[\w.+-]+(?:;[^\r\n]*)?$/.test(contentType) || contentType.length > 150)
          throw new StorageError(400, "Invalid file content type");
        const bytes = await boundedBody(
          request,
          bucket === "brand-logos" ? 5 * 1024 * 1024 : 50 * 1024 * 1024,
        );
        await backend().upload(bucket, path, bytes, contentType, upsert);
        return Response.json({ path }, { status: 201, headers: PRIVATE_HEADERS });
      }
      if (request.method !== "POST") throw new StorageError(405, "Unsupported file operation");
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(new TextDecoder().decode(await boundedBody(request, 128 * 1024)));
      } catch (error) {
        if (error instanceof StorageError) throw error;
        throw new StorageError(400, "Invalid file request");
      }
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new StorageError(400, "Invalid file request");
      if (input.operation === "delete") {
        if (!Array.isArray(input.paths) || !input.paths.length || input.paths.length > 100)
          throw new StorageError(400, "Invalid delete request");
        const paths = input.paths.map((p) => storagePath(p));
        // Validate every path before deleting any object. No unauthenticated batch loophole.
        for (const p of paths) assertStorageAccess(actor, bucket, p, "delete");
        for (const p of paths) await backend().delete(bucket, p);
        return Response.json(
          paths.map((name) => ({ name })),
          { headers: PRIVATE_HEADERS },
        );
      }
      if (input.operation === "list") {
        const limit = input.limit ?? 100;
        const offset = input.offset ?? 0;
        if (
          !Number.isInteger(limit) ||
          Number(limit) < 1 ||
          Number(limit) > 1000 ||
          !Number.isInteger(offset) ||
          Number(offset) < 0
        )
          throw new StorageError(400, "Invalid list pagination");
        const prefix = path ? path.replace(/\/$/, "") + "/" : "";
        let files: string[];
        if (canAccessStorage(actor, bucket, prefix, "read")) {
          files = await backend().listFiles(bucket, prefix);
        } else if (!prefix) {
          const owned = actor.franchisees.filter((f) =>
            canAccessStorage(actor, bucket, `${f.id}/`, "read"),
          );
          if (!owned.length) throw new StorageError(403, "File access denied");
          files = (
            await Promise.all(owned.map((f) => backend().listFiles(bucket, `${f.id}/`)))
          ).flat();
        } else {
          throw new StorageError(403, "File access denied");
        }
        const entries = new Map<string, { id: string | null; name: string }>();
        for (const file of files) {
          const relative = file.slice(prefix.length);
          const name = relative.split("/")[0];
          entries.set(name, { id: relative.includes("/") ? null : file, name });
        }
        return Response.json(
          [...entries.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(Number(offset), Number(offset) + Number(limit)),
          { headers: PRIVATE_HEADERS },
        );
      }
      assertStorageAccess(actor, bucket, path, "read");
      storagePath(path);
      if (input.operation === "exists")
        return Response.json(
          { exists: await backend().exists(bucket, path) },
          { headers: PRIVATE_HEADERS },
        );
      if (input.operation !== "signed-url") throw new StorageError(400, "Unknown file operation");
      if (
        typeof input.expiresIn !== "number" ||
        !Number.isFinite(input.expiresIn) ||
        input.expiresIn < 1
      )
        throw new StorageError(400, "Invalid file access lifetime");
      const issuedAt = now();
      const expiresAt = issuedAt + Math.min(Math.floor(input.expiresIn), MAX_FILE_ACCESS_SECONDS);
      if (
        input.download !== undefined &&
        typeof input.download !== "string" &&
        typeof input.download !== "boolean"
      )
        throw new StorageError(400, "Invalid download filename");
      if (!(await backend().exists(bucket, path))) throw new StorageError(404, "File not found");
      const filename =
        input.download === true
          ? path.split("/").at(-1)
          : typeof input.download === "string"
            ? input.download
            : undefined;
      const signed = signTicket(
        { v: 1, userId: actor.userId, bucket, path, issuedAt, expiresAt, download: filename },
        key(),
      );
      return Response.json(
        { signedUrl: `/api/storage?${new URLSearchParams({ ticket: signed })}`, expiresAt },
        { headers: PRIVATE_HEADERS },
      );
    } catch (error) {
      const status = error instanceof StorageError ? error.status : 502;
      return Response.json(
        { error: error instanceof StorageError ? error.message : "Private file operation failed" },
        { status, headers: PRIVATE_HEADERS },
      );
    }
  };
}
