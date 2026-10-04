import test from "node:test";
import assert from "node:assert/strict";
import { createStorageHandler } from "../src/lib/storage-handler.server.ts";
import {
  StorageError,
  canAccessStorage,
  legacyStoragePath,
  storagePath,
  type StorageActor,
  type StorageBucket,
} from "../src/lib/storage-policy.ts";
import type { StorageBackend } from "../src/lib/storage.server.ts";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const folder = "33333333-3333-4333-8333-333333333333";
const ownership = [{ id: folder, user_id: ownerId, manager_user_id: otherId }];
const actor = (roles: string[] = [], id = ownerId): StorageActor => ({
  userId: id,
  roles,
  franchisees: ownership,
});
const path = `${folder}/3225/ROI Claim + exact%20Case.pdf`;
const payload = Uint8Array.from([0, 1, 2, 255]);
function setup(initialActor = actor(["accounts"])) {
  const files = new Map<string, Uint8Array>([[`roi-claims/${path}`, payload]]);
  const operations: string[] = [];
  let currentActor = initialActor;
  let clock = 1000;
  const backend: StorageBackend = {
    async get(b, p) {
      operations.push("get");
      const bytes = files.get(`${b}/${p}`);
      if (!bytes) throw new StorageError(404, "File not found");
      return {
        body: new Blob([bytes]).stream(),
        size: bytes.length,
        contentType: "application/pdf",
      };
    },
    async exists(b, p) {
      operations.push("exists");
      return files.has(`${b}/${p}`);
    },
    async bucketExists() {
      return true;
    },
    async upload(b, p, bytes, _type, upsert) {
      operations.push("upload");
      if (!upsert && files.has(`${b}/${p}`)) throw new StorageError(409, "File already exists");
      files.set(`${b}/${p}`, bytes);
    },
    async delete(b, p) {
      operations.push("delete");
      files.delete(`${b}/${p}`);
    },
    async listFiles(b, prefix = "") {
      return [...files.keys()]
        .filter((k) => k.startsWith(b + "/" + prefix))
        .map((k) => k.slice(b.length + 1));
    },
  };
  const handler = createStorageHandler({
    backend,
    authenticate: async (request) => {
      if (request.headers.get("authorization") !== "Bearer fixture")
        throw new StorageError(401, "Sign in required");
      return currentActor;
    },
    resolveTicketUser: async () => currentActor,
    signingKey: () => "in-memory-test-signing-key",
    now: () => clock,
  });
  const request = (
    method: string,
    bucket: StorageBucket = "roi-claims",
    p = path,
    body?: unknown,
    authenticated = true,
  ) =>
    handler(
      new Request(`http://localhost/api/storage?${new URLSearchParams({ bucket, path: p })}`, {
        method,
        headers: authenticated
          ? {
              authorization: "Bearer fixture",
              "content-type":
                body instanceof Uint8Array ? "application/octet-stream" : "application/json",
            }
          : {},
        body:
          body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
      }),
    );
  return {
    handler,
    request,
    operations,
    files,
    setActor: (a: StorageActor) => {
      currentActor = a;
    },
    setTime: (t: number) => {
      clock = t;
    },
  };
}

test("production permission matrix: staff, owner, manager, stranger and unauthenticated", () => {
  const own = actor();
  const manager = actor([], otherId);
  const stranger = actor([], "stranger");
  assert.equal(canAccessStorage(own, "roi-claims", path, "read"), true);
  assert.equal(canAccessStorage(manager, "roi-claims", path, "read"), true);
  assert.equal(canAccessStorage(stranger, "roi-claims", path, "read"), false);
  assert.equal(canAccessStorage(own, "roi-claims", path, "insert"), false);
  assert.equal(canAccessStorage(actor(["accounts"]), "roi-claims", path, "delete"), true);
  assert.equal(canAccessStorage(actor(["hr"], "stranger"), "roi-claims", path, "read"), false);
  assert.equal(canAccessStorage(own, "franchisee-docs", path, "insert"), true);
  assert.equal(canAccessStorage(own, "franchisee-docs", path, "update"), false);
  assert.equal(canAccessStorage(manager, "franchisee-docs", path, "read"), false);
  assert.equal(canAccessStorage(actor(["founder"]), "franchisee-docs", path, "delete"), true);
  assert.equal(canAccessStorage(actor(["hr"]), "official-documents", "file.pdf", "read"), true);
  assert.equal(canAccessStorage(actor(["sales"]), "official-documents", "file.pdf", "read"), false);
  assert.equal(
    canAccessStorage(actor(["nail_emporium"]), "invoice-sources", "file.pdf", "insert"),
    true,
  );
  assert.equal(canAccessStorage(own, "invoice-sources", "file.pdf", "read"), false);
  assert.equal(canAccessStorage(own, "brand-logos", "logo.png", "delete"), true);
  assert.equal(canAccessStorage(own, "product-media", "image.png", "read"), true);
  assert.equal(canAccessStorage(own, "product-media", "image.png", "insert"), false);
  assert.equal(canAccessStorage(actor([], ""), "brand-logos", "logo.png", "read"), false);
});
test("unauthenticated and cross-franchise requests cannot touch the backend", async () => {
  const s = setup();
  assert.equal((await s.request("GET", "roi-claims", path, undefined, false)).status, 401);
  s.setActor(actor([], "stranger"));
  assert.equal((await s.request("GET")).status, 403);
  assert.deepEqual(s.operations, []);
});
test("authenticated download returns exact bytes and private response headers", async () => {
  const s = setup();
  const response = await s.request("GET");
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), payload);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});
test("controlled URL preserves exact keys, expires, and cannot authorize mutation", async () => {
  const s = setup();
  const response = await s.request("POST", "roi-claims", path, {
    operation: "signed-url",
    expiresIn: 300,
    download: "exact name.pdf",
  });
  const { signedUrl, expiresAt } = await response.json();
  assert.equal(expiresAt, 1300);
  assert.ok(signedUrl.startsWith("/api/storage?ticket="));
  const download = await s.handler(new Request("http://localhost" + signedUrl));
  assert.equal(download.status, 200);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), payload);
  assert.match(download.headers.get("content-disposition")!, /attachment/);
  assert.equal(
    (await s.handler(new Request("http://localhost" + signedUrl, { method: "POST", body: "{}" })))
      .status,
    403,
  );
  s.setTime(1300);
  assert.equal((await s.handler(new Request("http://localhost" + signedUrl))).status, 403);
});
test("tampered tickets and forged unsigned payloads are rejected", async () => {
  const s = setup();
  const response = await s.request("POST", "roi-claims", path, {
    operation: "signed-url",
    expiresIn: 300,
  });
  const { signedUrl } = await response.json();
  const url = new URL("http://localhost" + signedUrl);
  const token = url.searchParams.get("ticket")!;
  const [body, signature] = token.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  payload.path = "another.pdf";
  url.searchParams.set(
    "ticket",
    Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + signature,
  );
  assert.equal((await s.handler(new Request(url))).status, 403);
  assert.equal(
    (await s.handler(new Request("http://localhost/api/storage?ticket=unsigned"))).status,
    403,
  );
});
test("revoked role or ownership invalidates existing controlled access", async () => {
  const s = setup(actor());
  const response = await s.request("POST", "roi-claims", path, {
    operation: "signed-url",
    expiresIn: 300,
  });
  const { signedUrl } = await response.json();
  s.setActor(actor([], "stranger"));
  assert.equal((await s.handler(new Request("http://localhost" + signedUrl))).status, 403);
});
test("one-year legacy requests are bounded to one hour", async () => {
  const s = setup();
  const response = await s.request("POST", "roi-claims", path, {
    operation: "signed-url",
    expiresIn: 365 * 24 * 3600,
  });
  assert.equal((await response.json()).expiresAt, 4600);
});
test("authorized upload/readback succeeds and no-upsert conflict preserves existing bytes", async () => {
  const s = setup();
  const newPath = `${folder}/3225/test.docx`;
  assert.equal((await s.request("PUT", "roi-claims", newPath, payload)).status, 201);
  assert.deepEqual(
    new Uint8Array(await (await s.request("GET", "roi-claims", newPath)).arrayBuffer()),
    payload,
  );
  assert.equal((await s.request("PUT", "roi-claims", newPath, new Uint8Array([9]))).status, 409);
  assert.deepEqual(s.files.get("roi-claims/" + newPath), payload);
});
test("owner can insert franchisee docs but cannot upsert, update or delete", async () => {
  const s = setup(actor());
  const file = `${folder}/id.pdf`;
  assert.equal((await s.request("PUT", "franchisee-docs", file, payload)).status, 201);
  const url = `http://localhost/api/storage?${new URLSearchParams({ bucket: "franchisee-docs", path: file, upsert: "true" })}`;
  assert.equal(
    (
      await s.handler(
        new Request(url, {
          method: "PUT",
          headers: { authorization: "Bearer fixture" },
          body: payload,
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await s.request("POST", "franchisee-docs", "", { operation: "delete", paths: [file] })).status,
    403,
  );
  assert.ok(s.files.has("franchisee-docs/" + file));
});
test("delete requires authenticated authorized server operation", async () => {
  const s = setup(actor());
  assert.equal(
    (await s.request("POST", "roi-claims", "", { operation: "delete", paths: [path] })).status,
    403,
  );
  assert.ok(!s.operations.includes("delete"));
  s.setActor(actor(["accounts"]));
  assert.equal(
    (await s.request("POST", "roi-claims", "", { operation: "delete", paths: [path] })).status,
    200,
  );
  assert.ok(!s.files.has("roi-claims/" + path));
});
test("traversal, unknown buckets, over-limit bodies and cross-origin writes are rejected", async () => {
  const s = setup();
  assert.throws(() => storagePath("../file.pdf"));
  assert.throws(() => storagePath("a\\file.pdf"));
  assert.equal(
    (
      await s.handler(
        new Request("http://localhost/api/storage?bucket=database_export_01_10_26&path=file"),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await s.handler(
        new Request("http://localhost/api/storage?bucket=brand-logos&path=logo.png", {
          method: "PUT",
          headers: { authorization: "Bearer fixture", "content-length": String(6 * 1024 * 1024) },
          body: payload,
        }),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await s.handler(
        new Request("http://localhost/api/storage?bucket=brand-logos&path=logo.png", {
          method: "PUT",
          headers: { authorization: "Bearer fixture", origin: "https://untrusted.invalid" },
          body: payload,
        }),
      )
    ).status,
    403,
  );
  assert.ok(!s.operations.includes("upload"));
});
test("legacy storage URLs decode once while literal raw keys remain unchanged", () => {
  const original = "Dir/ROI Claim + exact%20Case.pdf";
  assert.equal(legacyStoragePath(original, "roi-claims"), original);
  assert.equal(
    legacyStoragePath(
      "https://legacy.invalid/storage/v1/object/public/roi-claims/" +
        encodeURIComponent(original) +
        "?token=old",
      "roi-claims",
    ),
    original,
  );
  assert.equal(legacyStoragePath("https://external.invalid/logo.png", "brand-logos"), null);
});

test("production resolver validates NEW Supabase session and rechecks permissions on ticket redemption", async () => {
  const originalFetch = globalThis.fetch;
  const names = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MINIO_SECRET_KEY",
  ];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    SUPABASE_URL: "https://kgyofhcyifrpogdcyugw.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    MINIO_SECRET_KEY: "test-only-signing-input",
  });
  let roles = ["accounts"];
  let validSession = true;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, "https://kgyofhcyifrpogdcyugw.supabase.co");
    requested.push(url.pathname);
    if (url.pathname === "/auth/v1/user")
      return validSession
        ? Response.json({ id: ownerId, aud: "authenticated", role: "authenticated" })
        : Response.json({ message: "Invalid session" }, { status: 401 });
    if (url.pathname === "/auth/v1/admin/users/" + ownerId)
      return Response.json({ id: ownerId, aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/user_roles")
      return Response.json(roles.map((role) => ({ role })));
    if (url.pathname === "/rest/v1/franchisees") return Response.json([]);
    throw new Error("Unexpected Supabase operation");
  };
  try {
    const fixture = setup();
    const backend: StorageBackend = {
      async get() {
        return { body: new Blob([payload]).stream(), size: payload.length };
      },
      async exists() {
        return true;
      },
      async bucketExists() {
        return true;
      },
      async upload() {
        throw new Error("Unexpected write");
      },
      async delete() {
        throw new Error("Unexpected delete");
      },
      async listFiles() {
        return [];
      },
    };
    const handler = createStorageHandler({ backend });
    const url = `http://localhost/api/storage?${new URLSearchParams({ bucket: "roi-claims", path })}`;
    const minted = await handler(
      new Request(url, {
        method: "POST",
        headers: { authorization: "Bearer test-session-token" },
        body: JSON.stringify({ operation: "signed-url", expiresIn: 300 }),
      }),
    );
    assert.equal(minted.status, 200);
    const { signedUrl } = await minted.json();
    assert.equal((await handler(new Request("http://localhost" + signedUrl))).status, 200);
    roles = [];
    assert.equal((await handler(new Request("http://localhost" + signedUrl))).status, 403);
    validSession = false;
    assert.equal(
      (
        await handler(
          new Request(url, { headers: { authorization: "Bearer invalid-session-token" } }),
        )
      ).status,
      401,
    );
    assert.ok(requested.includes("/auth/v1/user"));
    assert.ok(requested.includes("/auth/v1/admin/users/" + ownerId));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});
test("production unauthenticated access is rejected before storage/configuration lookup", async () => {
  const handler = createStorageHandler();
  const url = `http://localhost/api/storage?${new URLSearchParams({ bucket: "roi-claims", path })}`;
  assert.equal((await handler(new Request(url))).status, 401);
});

test("folder listing preserves owner access while excluding other franchises", async () => {
  const s = setup(actor());
  s.files.set(`${"roi-claims"}/${"44444444-4444-4444-8444-444444444444"}/3226/other.pdf`, payload);
  const root = await s.request("POST", "roi-claims", "", { operation: "list" });
  assert.equal(root.status, 200);
  assert.deepEqual(await root.json(), [{ id: null, name: folder }]);
  const nested = await s.request("POST", "roi-claims", folder, { operation: "list" });
  assert.equal(nested.status, 200);
  assert.deepEqual(await nested.json(), [{ id: null, name: "3225" }]);
  assert.equal(
    (
      await s.request("POST", "roi-claims", "44444444-4444-4444-8444-444444444444", {
        operation: "list",
      })
    ).status,
    403,
  );
  s.setActor(actor([], otherId));
  assert.equal((await s.request("POST", "roi-claims", "", { operation: "list" })).status, 200);
  assert.equal((await s.request("POST", "franchisee-docs", "", { operation: "list" })).status, 403);
});
