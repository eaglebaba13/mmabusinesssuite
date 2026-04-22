import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { supabase as browserSupabase } from "@/integrations/supabase/client";

// Forwards the user's access token to the server so requireSupabaseAuth can read it.
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
  franchisee_id: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8).max(64),
  full_name: z.string().min(1).max(120),
});

export const createFranchiseeUser = createServerFn({ method: "POST" })
  .middleware([forwardAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    // Verify caller is admin/founder
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some(
      (r) => r.role === "super_admin" || r.role === "founder",
    );
    if (!isAdmin) {
      throw new Error("Only super admins/founders can create franchisee logins");
    }

    // 1. Create or fetch auth user
    let authUserId: string | undefined;
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });

    if (createErr) {
      // If already exists, look it up via listing
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
        // reset password to the new temp password
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

    // 2. Assign franchisee role (idempotent)
    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: authUserId, role: "franchisee" },
        { onConflict: "user_id,role" },
      );

    // 3. Link franchisee record
    const { error: linkErr } = await supabaseAdmin
      .from("franchisees")
      .update({ user_id: authUserId })
      .eq("id", data.franchisee_id);
    if (linkErr) throw new Error(linkErr.message);

    // 4. Save credentials (admin-only readable)
    await supabaseAdmin.from("franchisee_credentials").insert({
      franchisee_id: data.franchisee_id,
      login_email: data.email,
      temp_password: data.password,
      created_by: userId,
    });

    return { success: true, user_id: authUserId };
  });
