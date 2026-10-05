/** Live disposable staging CRUD; fixture identities, no Supabase calls. */
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createMinioBackend } from "../src/lib/storage.server.ts";
import { createStorageHandler } from "../src/lib/storage-handler.server.ts";
import { StorageError } from "../src/lib/storage-policy.ts";
const real = createMinioBackend();
const franchiseId = randomUUID();
const path = `${franchiseId}/__mma-staging__/${randomUUID()}/Disposable staging file with spaces.bin`;
const bucket = "roi-claims";
const bytes = Buffer.from("MMA disposable staging verification\n" + randomUUID());
const actor = { userId: "staging-fixture", roles: ["super_admin"], franchisees: [] };
let now = Date.now();
const handler = createStorageHandler({
  backend: real,
  authenticate: async (req) => {
    if (req.headers.get("authorization") !== "Bearer staging-fixture")
      throw new StorageError(401, "Sign in required");
    return actor;
  },
  resolveTicketUser: async () => actor,
  now: () => now,
});
const url = "http://localhost/api/storage?" + new URLSearchParams({ bucket, path });
const headers = { authorization: "Bearer staging-fixture" };
const checks: Record<string, boolean> = {};
const requireCheck = (name: string, ok: boolean) => {
  checks[name] = ok;
  if (!ok) throw new Error("Staging check failed: " + name);
};
const report = {
  result: "FAIL",
  auth_mode: "Injected identities; real NEW Supabase signed-in session not tested",
  bucket,
  disposable_path: path,
  checks,
  production_objects_modified: 0,
  cleanup_confirmed: false,
};
let created = false;
try {
  requireCheck("bucket_exists", await real.bucketExists(bucket));
  requireCheck("new_disposable_path", !(await real.exists(bucket, path)));
  const put = await handler(
    new Request(url, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/octet-stream" },
      body: bytes,
    }),
  );
  requireCheck("upload", put.status === 201);
  created = true;
  requireCheck(
    "head",
    (await handler(new Request(url, { method: "HEAD", headers }))).status === 200,
  );
  const get = await handler(new Request(url, { headers }));
  const received = Buffer.from(await get.arrayBuffer());
  requireCheck(
    "download_exact_sha256",
    get.status === 200 &&
      createHash("sha256").update(received).digest("hex") ===
        createHash("sha256").update(bytes).digest("hex"),
  );
  requireCheck("unauthenticated_401", (await handler(new Request(url))).status === 401);
  const denied = createStorageHandler({
    backend: real,
    authenticate: async () => ({
      userId: "other-franchise",
      roles: [],
      franchisees: [{ id: "other-id", user_id: "other-franchise", manager_user_id: null }],
    }),
  });
  const owner = createStorageHandler({
    backend: real,
    authenticate: async () => ({
      userId: "owner-fixture",
      roles: [],
      franchisees: [{ id: franchiseId, user_id: "owner-fixture", manager_user_id: null }],
    }),
  });
  const ownerRead = await owner(new Request(url));
  requireCheck(
    "own_franchise_read",
    ownerRead.status === 200 && Buffer.from(await ownerRead.arrayBuffer()).equals(bytes),
  );
  requireCheck("cross_franchise_403", (await denied(new Request(url))).status === 403);
  const post = (body: object) =>
    new Request(url, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const signed = await handler(post({ operation: "signed-url", expiresIn: 60 }));
  const { signedUrl } = await signed.json();
  const read = await handler(new Request("http://localhost" + signedUrl));
  requireCheck(
    "controlled_access",
    read.status === 200 && Buffer.from(await read.arrayBuffer()).equals(bytes),
  );
  const tamperedLink = new URL("http://localhost" + signedUrl);
  const ticket = tamperedLink.searchParams.get("ticket")!;
  const dot = ticket.indexOf(".");
  tamperedLink.searchParams.set(
    "ticket",
    ticket.slice(0, dot + 1) + (ticket[dot + 1] === "a" ? "b" : "a") + ticket.slice(dot + 2),
  );
  const tampered = tamperedLink.pathname + tamperedLink.search;
  requireCheck(
    "controlled_access_tampered",
    (await handler(new Request("http://localhost" + tampered))).status === 403,
  );
  now += 61000;
  requireCheck(
    "controlled_access_expired",
    (await handler(new Request("http://localhost" + signedUrl))).status === 403,
  );
  const forbiddenDelete = await denied(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "delete", paths: [path] }),
    }),
  );
  requireCheck("unauthorized_delete_403", forbiddenDelete.status === 403);
  requireCheck("object_survives_denied_delete", await real.exists(bucket, path));
  const deletion = await handler(post({ operation: "delete", paths: [path] }));
  requireCheck("authorized_delete", deletion.status === 200);
  requireCheck("deleted_object_absent", !(await real.exists(bucket, path)));
  created = false;
  report.cleanup_confirmed = true;
  // Only a never-created disposable path outside the permitted staging prefix.
  if (process.env.STAGING_IAM_PREFIX_ONLY !== "false")
    for (const [op, fn] of Object.entries({
      read: () => real.get(bucket, "__mma-forbidden__/never-created.bin"),
      upload: () =>
        real.upload(
          bucket,
          "__mma-forbidden__/never-created.bin",
          bytes,
          "application/octet-stream",
          false,
        ),
      delete: () => real.delete(bucket, "__mma-forbidden__/never-created.bin"),
    })) {
      let rejected = false;
      try {
        await fn();
      } catch (e) {
        rejected = (e as { name?: string }).name === "AccessDenied";
      }
      requireCheck("iam_outside_prefix_denied_" + op, rejected);
    }
  report.result = "PASS";
} finally {
  if (created) {
    await real.delete(bucket, path);
    report.cleanup_confirmed = !(await real.exists(bucket, path));
  }
  await writeFile(process.env.STAGING_SMOKE_REPORT!, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
