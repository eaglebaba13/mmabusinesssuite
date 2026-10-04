import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMinioBackend, createMinioSocketAgent } from "../src/lib/storage.server.ts";
import { permittedRequest, startRelay } from "../deployment/minio-unix-relay.mjs";

const auth =
  "AWS4-HMAC-SHA256 Credential=fixture/20261004/us-east-1/s3/aws4_request, SignedHeaders=host, Signature=fixture";
test("relay rejects admin, root, alternate identities and unsupported S3 operations", () => {
  for (const [method, path] of [
    ["GET", "/"],
    ["GET", "/minio/admin/v3/info"],
    ["PUT", "/roi-claims"],
    ["POST", "/roi-claims/file?uploads"],
    ["GET", "/roi-claims/file?acl"],
    ["GET", "/database_export_01_10_26/file"],
    ["GET", "/roi-claims?policy"],
    ["DELETE", "/roi-claims"],
    ["CONNECT", "/roi-claims/file"],
  ])
    assert.equal(permittedRequest(method, path, auth, "fixture"), false, method + " " + path);
  assert.equal(permittedRequest("GET", "/roi-claims/file", undefined, "fixture"), false);
  assert.equal(permittedRequest("DELETE", "/roi-claims/file", auth, "another"), false);
  for (const method of ["GET", "HEAD", "PUT", "DELETE"])
    assert.equal(permittedRequest(method, "/roi-claims/Exact%20file.pdf", auth, "fixture"), true);
  assert.equal(
    permittedRequest("GET", "/roi-claims?list-type=2&prefix=Exact%20path", auth, "fixture"),
    true,
  );
});

test("socket client uses Unix IPC without DNS fallback; relay exposes no TCP listener", async () => {
  if (process.platform === "win32") return;
  const dir = await mkdtemp(join(tmpdir(), "mma-unix-"));
  const socketPath = join(dir, "s3.sock");
  const relay = await startRelay({ socketPath, accessKeyId: "fixture" });
  const agent = createMinioSocketAgent(socketPath);
  try {
    assert.equal(relay.server.address(), socketPath);
    const code = await new Promise((resolve, reject) => {
      const request = http.get(
        { hostname: "this-host-must-never-resolve.invalid", path: "/minio/admin/v3/info", agent },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      );
      request.on("error", reject);
    });
    assert.equal(code, 403);
    const missing = createMinioSocketAgent(join(dir, "missing.sock"));
    try {
      await assert.rejects(
        new Promise((resolve, reject) => {
          const request = http.get(
            { hostname: "this-host-must-never-resolve.invalid", agent: missing },
            resolve,
          );
          request.on("error", reject);
        }),
        (error) => error.code === "ENOENT",
      );
    } finally {
      missing.destroy();
    }
    await assert.rejects(startRelay({ socketPath, accessKeyId: "fixture" }), /already running/);
    assert.throws(() => createMinioSocketAgent("relative.sock"));
    assert.throws(
      () =>
        createMinioBackend({
          MINIO_ENDPOINT: "http://logical-only.invalid",
          MINIO_ACCESS_KEY: "fixture",
          MINIO_SECRET_KEY: "fixture",
        }),
      /socket configuration/,
    );
  } finally {
    agent.destroy();
    await relay.close();
    await rm(dir, { recursive: true });
  }
});
