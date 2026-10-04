/** Disposable Unix transport integration. Never mutate checkpoint objects. */
import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createMinioBackend, createMinioSocketAgent } from "../src/lib/storage.server.ts";
import type { StorageBucket } from "../src/lib/storage-policy.ts";
const backend = createMinioBackend();
const agent = createMinioSocketAgent(process.env.MINIO_SOCKET_PATH!);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(await readFile("/reports/manifest.json", "utf8"));
const checks: Record<string, boolean | number> = {};
const path = `${randomUUID()}/__mma-staging__/${randomUUID()}/Large file with spaces.bin`;
const bytes = Buffer.alloc(8 * 1024 * 1024, 73);
// S3 object keys are literal: encode each path segment, never the separators,
// so spaces (and ?/#/&) cannot alter routing. The query string stays verbatim.
const encodeTarget = (target: string) => {
  const question = target.indexOf("?");
  const rawPath = question === -1 ? target : target.slice(0, question);
  const query = question === -1 ? "" : target.slice(question);
  return rawPath.split("/").map(encodeURIComponent).join("/") + query;
};
const raw = (method: string, target: string, auth?: string) =>
  new Promise<number>((resolve, reject) => {
    const request = http.request(
      {
        method,
        hostname: "logical-only.invalid",
        port: 9000,
        path: encodeTarget(target),
        agent,
        headers: auth ? { authorization: auth } : {},
      },
      (reply) => {
        reply.resume();
        reply.on("end", () => resolve(reply.statusCode!));
      },
    );
    request.on("error", reject);
    request.end();
  });
let created = false;
try {
  let matches = 0;
  for (const row of manifest) {
    const file = await backend.get(row.bucket as StorageBucket, row.object_path);
    const actual = new Uint8Array(await new Response(file.body).arrayBuffer());
    assert.equal(actual.byteLength, row.source_size);
    assert.equal(digest(actual), row.source_sha256);
    matches++;
  }
  assert.equal(matches, 131);
  checks.exact_clone_hashes_through_socket = matches;
  await backend.upload("roi-claims", path, bytes, "application/octet-stream", false);
  created = true;
  assert.equal(await backend.exists("roi-claims", path), true);
  checks.large_upload_head = true;
  const file = await backend.get("roi-claims", path);
  assert.equal(digest(new Uint8Array(await new Response(file.body).arrayBuffer())), digest(bytes));
  checks.large_stream_readback = true;
  const range = await backend.get("roi-claims", path, "bytes=10-99");
  assert.deepEqual(
    Buffer.from(await new Response(range.body).arrayBuffer()),
    bytes.subarray(10, 100),
  );
  checks.range_read = true;
  assert.equal(await raw("GET", "/roi-claims/" + path), 403);
  checks.unsigned_read_denied = true;
  assert.equal(await raw("DELETE", "/roi-claims/" + path), 403);
  checks.unsigned_delete_denied = true;
  const fake = `AWS4-HMAC-SHA256 Credential=${process.env.MINIO_ACCESS_KEY}/20261004/us-east-1/s3/aws4_request, SignedHeaders=host, Signature=invalid`;
  assert.equal(await raw("GET", "/minio/admin/v3/info", fake), 403);
  checks.admin_api_denied = true;
  assert.equal(await raw("PUT", "/roi-claims?policy", fake), 403);
  checks.bucket_policy_changes_denied = true;
  const wrong = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: "deliberately-invalid-secret",
    },
    requestHandler: { httpAgent: agent },
    maxAttempts: 1,
  });
  for (const [name, command] of [
    ["invalid_signature_read", new GetObjectCommand({ Bucket: "roi-claims", Key: path })],
    ["invalid_signature_delete", new DeleteObjectCommand({ Bucket: "roi-claims", Key: path })],
  ] as const) {
    await assert.rejects(
      wrong.send(command),
      (error: unknown) =>
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 403,
    );
    checks[name] = true;
  }
  assert.equal(await backend.exists("roi-claims", path), true);
  checks.denied_delete_preserves_object = true;
  await backend.delete("roi-claims", path);
  created = false;
  assert.equal(await backend.exists("roi-claims", path), false);
  checks.cleanup = true;
  await writeFile(
    "/reports/unix-live.json",
    JSON.stringify(
      {
        result: "PASS",
        checks,
        production_objects_modified: 0,
        target: "DISPOSABLE CLONE",
        identity: "existing production bucket-scoped identity",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ result: "PASS", checks }));
} finally {
  if (created) await backend.delete("roi-claims", path);
  agent.destroy();
}
