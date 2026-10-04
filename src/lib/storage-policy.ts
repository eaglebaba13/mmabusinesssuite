/** Client-safe bucket names and the exact access rules from the production backup. */
export const STORAGE_BUCKETS = [
  "brand-logos",
  "franchisee-docs",
  "invoice-sources",
  "official-documents",
  "product-media",
  "roi-claims",
] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];
export type StorageOperation = "read" | "insert" | "update" | "delete";
export type StorageActor = {
  userId: string;
  roles: string[];
  franchisees: { id: string; user_id: string | null; manager_user_id: string | null }[];
};
export class StorageError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "StorageError";
  }
}
export function storageBucket(value: unknown): StorageBucket {
  if (typeof value !== "string" || !STORAGE_BUCKETS.includes(value as StorageBucket)) {
    throw new StorageError(400, "Unknown application bucket");
  }
  return value as StorageBucket;
}
export function storagePath(value: unknown, allowEmpty = false): string {
  if (
    typeof value !== "string" ||
    (!value && !allowEmpty) ||
    value.length > 1024 ||
    value.startsWith("/") ||
    // eslint-disable-next-line no-control-regex -- Explicitly reject/strip filename control characters.
    /[\\\u0000-\u001f\u007f]/.test(value) ||
    value.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new StorageError(400, "Invalid object path");
  }
  return value; // Never trim, lowercase, decode, flatten or rename database paths.
}
export function canAccessStorage(
  actor: StorageActor,
  bucket: StorageBucket,
  path: string,
  op: StorageOperation,
): boolean {
  if (!actor.userId) return false;
  const has = (...roles: string[]) => actor.roles.some((role) => roles.includes(role));
  const admin = has("super_admin", "founder");
  const folder = path.includes("/") ? path.split("/")[0] : "";
  if (bucket === "brand-logos") return true;
  if (bucket === "product-media") return op === "read" || admin;
  if (bucket === "invoice-sources") return admin || has("accounts", "nail_emporium");
  if (bucket === "official-documents") return admin || has("accounts", "hr");
  if (bucket === "roi-claims") {
    return (
      admin ||
      has("accounts") ||
      (op === "read" &&
        actor.franchisees.some(
          (f) =>
            f.id === folder && (f.user_id === actor.userId || f.manager_user_id === actor.userId),
        ))
    );
  }
  return (
    admin ||
    ((op === "read" || op === "insert") &&
      actor.franchisees.some((f) => f.id === folder && f.user_id === actor.userId))
  );
}
export function assertStorageAccess(
  actor: StorageActor,
  bucket: StorageBucket,
  path: string,
  op: StorageOperation,
) {
  if (!canAccessStorage(actor, bucket, path, op)) throw new StorageError(403, "File access denied");
}
/** Extract only recognized legacy Supabase storage URLs; raw keys stay unchanged. */
export function legacyStoragePath(stored: string, bucket: StorageBucket): string | null {
  if (!/^https?:\/\//i.test(stored)) return stored;
  try {
    const url = new URL(stored);
    const marker = `/storage/v1/object/`;
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    const tail = url.pathname.slice(index + marker.length);
    const match = /^(?:public|sign|authenticated)\/([^/]+)\/(.+)$/.exec(tail);
    if (!match || match[1] !== bucket) return null;
    return decodeURIComponent(match[2]);
  } catch {
    return null;
  }
}
