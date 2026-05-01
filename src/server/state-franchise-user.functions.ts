import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { supabase as browserSupabase } from "@/integrations/supabase/client";

const forwardAuthHeader = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await browserSupabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);

const Input = z.object({
  state_franchise_id: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8).max(64),
  full_name: z.string().min(1).max(120),
});

async function assertAdmin(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some(
    (r) => r.role === "super_admin" || r.role === "founder",
  );
  if (!isAdmin) throw new Error("Only super admins/founders can perform this action");
}

export const createStateFranchiseUser = createServerFn({ method: "POST" })
  .middleware([forwardAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertAdmin(userId);

    let authUserId: string | undefined;
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });

    if (createErr) {
      if (
        createErr.message?.toLowerCase().includes("already") ||
        createErr.message?.toLowerCase().includes("registered")
      ) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const existing = list?.users.find(
          (u) => u.email?.toLowerCase() === data.email.toLowerCase(),
        );
        if (!existing) throw new Error(createErr.message);
        authUserId = existing.id;
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password: data.password,
        });
      } else {
        throw new Error(createErr.message);
      }
    } else {
      authUserId = created.user?.id;
    }

    if (!authUserId) throw new Error("Failed to obtain auth user id");

    // Assign role (cast — types regenerate after enum value commits)
    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: authUserId, role: "state_franchisee" as never },
        { onConflict: "user_id,role" },
      );

    const { error: linkErr } = await supabaseAdmin
      .from("state_franchises" as never)
      .update({ user_id: authUserId } as never)
      .eq("id", data.state_franchise_id);
    if (linkErr) throw new Error(linkErr.message);

    await supabaseAdmin.from("state_franchise_credentials" as never).insert({
      state_franchise_id: data.state_franchise_id,
      login_email: data.email,
      temp_password: data.password,
      created_by: userId,
    } as never);

    return { success: true, user_id: authUserId };
  });

const ResetInput = z.object({
  state_franchise_id: z.string().uuid(),
});

function genPassword(length = 12) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
  let pw = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) pw += chars[arr[i] % chars.length];
  return pw;
}

export const resetStateFranchisePassword = createServerFn({ method: "POST" })
  .middleware([forwardAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => ResetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some(
      (r) => r.role === "super_admin" || r.role === "founder" || r.role === "accounts",
    );
    if (!isAdmin) throw new Error("Only admins can reset state franchise passwords");

    const { data: sf, error: sfErr } = await supabaseAdmin
      .from("state_franchises" as never)
      .select("user_id, email")
      .eq("id", data.state_franchise_id)
      .maybeSingle();
    if (sfErr) throw new Error(sfErr.message);
    const sfRow = sf as { user_id: string | null; email: string | null } | null;
    if (!sfRow?.user_id) throw new Error("This state franchise has no login yet");

    const password = genPassword(12);
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      sfRow.user_id,
      { password },
    );
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin.from("state_franchise_credentials" as never).insert({
      state_franchise_id: data.state_franchise_id,
      login_email: sfRow.email ?? "",
      temp_password: password,
      created_by: userId,
    } as never);

    return { success: true, password };
  });
