/** Live S3 reads only. Auth fixtures exercise the real application delivery handler. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createMinioBackend } from "../src/lib/storage.server.ts";
import { createStorageHandler } from "../src/lib/storage-handler.server.ts";
import { StorageError, type StorageBucket } from "../src/lib/storage-policy.ts";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/storage-migrated-paths.json", import.meta.url), "utf8"),
);
const real = createMinioBackend();
const readOnly = {
  ...real,
  upload: async () => {
    throw new Error("Live writes forbidden");
  },
  delete: async () => {
    throw new Error("Live deletes forbidden");
  },
};
const staff = { userId: "integration-fixture", roles: ["super_admin"], franchisees: [] };
const handler = createStorageHandler({
  backend: readOnly,
  authenticate: async (request) => {
    if (request.headers.get("authorization") !== "Bearer integration-fixture")
      throw new StorageError(401, "Sign in required");
    return staff;
  },
  resolveTicketUser: async () => staff,
});
const result = {
  result: "FAIL",
  auth_mode:
    "Injected fixture identities; live JWT/session validation still requires a signed-in staging smoke test",
  live_storage_writes: 0,
  live_storage_deletes: 0,
  buckets: [] as string[],
  objects: [] as Record<string, unknown>[],
  controlled_access: false,
  unauthenticated_rejected: false,
  unauthorized_rejected: false,
  output_contains_secrets: false,
};
try {
  for (const bucket of fixture.buckets as StorageBucket[]) {
    if (!(await real.bucketExists(bucket))) throw new Error("Required bucket missing");
    result.buckets.push(bucket);
  }
  let targetCount = 0;
  for (const bucket of fixture.buckets as StorageBucket[])
    targetCount += (await real.listFiles(bucket)).length;
  if (targetCount !== 131) throw new Error("Application object count changed");
  for (const row of fixture.objects) {
    if (!(await real.exists(row.bucket, row.object_path)))
      throw new Error("Representative object missing");
    const url = `http://localhost/api/storage?${new URLSearchParams({ bucket: row.bucket, path: row.object_path })}`;
    const response = await handler(
      new Request(url, { headers: { authorization: "Bearer integration-fixture" } }),
    );
    if (response.status !== 200) throw new Error("Controlled application download failed");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.length !== row.source_size ||
      createHash("sha256").update(bytes).digest("hex") !== row.source_sha256
    )
      throw new Error("Representative object byte mismatch");
    result.objects.push({
      bucket: row.bucket,
      object_path: row.object_path,
      size: bytes.length,
      sha256_match: true,
      exact_path_match: true,
    });
  }
  const row = fixture.objects[0];
  const url = `http://localhost/api/storage?${new URLSearchParams({ bucket: row.bucket, path: row.object_path })}`;
  const minted = await handler(
    new Request(url, {
      method: "POST",
      headers: { authorization: "Bearer integration-fixture", "content-type": "application/json" },
      body: JSON.stringify({ operation: "signed-url", expiresIn: 300 }),
    }),
  );
  const { signedUrl } = await minted.json();
  const delivery = await handler(new Request("http://localhost" + signedUrl));
  if (delivery.status !== 200) throw new Error("Ticket redemption failed");
  const bytes = new Uint8Array(await delivery.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== row.source_sha256)
    throw new Error("Ticket download differs");
  result.controlled_access = true;
  result.unauthenticated_rejected = (await handler(new Request(url))).status === 401;
  const denied = createStorageHandler({
    backend: readOnly,
    authenticate: async () => ({ userId: "unauthorized-fixture", roles: [], franchisees: [] }),
  });
  result.unauthorized_rejected = (await denied(new Request(url))).status === 403;
  if (!result.unauthenticated_rejected || !result.unauthorized_rejected)
    throw new Error("Authorization rejection failed");
  result.result = "PASS";
} finally {
  const destination = process.env.STORAGE_CHECK_REPORT;
  if (destination) await writeFile(destination, JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify({
      result: result.result,
      buckets_verified: result.buckets.length,
      objects_verified: result.objects.length,
      controlled_access: result.controlled_access,
      unauthenticated_rejected: result.unauthenticated_rejected,
      unauthorized_rejected: result.unauthorized_rejected,
      live_storage_writes: 0,
      live_storage_deletes: 0,
    }),
  );
}
