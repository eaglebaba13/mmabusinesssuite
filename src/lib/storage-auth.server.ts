/** Server-only authentication; only NEW Supabase may authorize MinIO access. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { StorageError, type StorageActor } from "./storage-policy.ts";

const NEW_URL = "https://kgyofhcyifrpogdcyugw.supabase.co";
function clients() {
  const url = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url?.replace(/\/$/, "") !== NEW_URL || !publicKey || !serverKey) {
    throw new StorageError(503, "NEW Supabase storage authorization is not configured");
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    user: createClient<Database>(url, publicKey, options),
    admin: createClient<Database>(url, serverKey, options),
  };
}
async function actorFor(
  admin: SupabaseClient<Database>,
  userId: string,
  path: string,
): Promise<StorageActor> {
  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new StorageError(503, "Unable to verify file permissions");
  const folder = path.split("/")[0];
  let franchisees: StorageActor["franchisees"] = [];
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folder)) {
    const result = await admin
      .from("franchisees")
      .select("id,user_id,manager_user_id")
      .eq("id", folder);
    if (result.error) throw new StorageError(503, "Unable to verify file ownership");
    franchisees = result.data ?? [];
  }
  if (!path) {
    const result = await admin
      .from("franchisees")
      .select("id,user_id,manager_user_id")
      .or(`user_id.eq.${userId},manager_user_id.eq.${userId}`);
    if (result.error) throw new StorageError(503, "Unable to verify file ownership");
    franchisees = result.data ?? [];
  }
  return { userId, roles: (data ?? []).map((row) => row.role), franchisees };
}
export async function authenticateStorageRequest(
  request: Request,
  path: string,
): Promise<StorageActor> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ") || !auth.slice(7))
    throw new StorageError(401, "Sign in required");
  const { user, admin } = clients();
  const { data, error } = await user.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new StorageError(401, "Session invalid");
  return actorFor(admin, data.user.id, path);
}
export async function resolveStorageTicketUser(
  userId: string,
  path: string,
): Promise<StorageActor> {
  const { admin } = clients();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (
    error ||
    !data.user ||
    (data.user.banned_until && Date.parse(data.user.banned_until) > Date.now())
  ) {
    throw new StorageError(403, "File access denied");
  }
  return actorFor(admin, userId, path);
}
