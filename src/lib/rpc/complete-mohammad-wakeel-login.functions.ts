import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TARGET_FRANCHISEE_ID = "f40bd753-5a21-4b6a-a55f-0073ccf786fc";
const TARGET_NAME = "Mohammad Wakeel";
const TARGET_EMAIL = "creation.diverse@gmail.com";

const Input = z.object({
  franchisee_id: z.literal(TARGET_FRANCHISEE_ID),
});

function generateTemporaryPassword(length = 18) {
  const groups = [
    "ABCDEFGHJKMNPQRSTUVWXYZ",
    "abcdefghijkmnpqrstuvwxyz",
    "23456789",
    "!@#$%",
  ];
  const all = groups.join("");
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  const chars = groups.map((group, index) => group[values[index] % group.length]);
  for (let index = groups.length; index < length; index += 1) {
    chars.push(all[values[index] % all.length]);
  }
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = values[index] % (index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join("");
}

export const completeMohammadWakeelLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isSuperAdmin, error: superAdminError } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "super_admin" },
    );
    const { data: isFounder, error: founderError } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "founder" },
    );
    if (superAdminError || founderError) throw new Error("Unable to verify administrator access");
    if (!isSuperAdmin && !isFounder) throw new Error("Only super admins or founders can complete this login");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalizedEmail = TARGET_EMAIL.toLowerCase();

    const { data: matchingFranchisees, error: franchiseLookupError } = await supabaseAdmin
      .from("franchisees")
      .select("id,full_name,email,user_id")
      .ilike("email", TARGET_EMAIL);
    if (franchiseLookupError) throw new Error(franchiseLookupError.message);
    if (matchingFranchisees?.length !== 1 || matchingFranchisees[0]?.id !== data.franchisee_id) {
      throw new Error("Ownership check is ambiguous; no changes were made");
    }

    const franchisee = matchingFranchisees[0];
    if (
      franchisee.full_name.trim() !== TARGET_NAME ||
      franchisee.email?.trim().toLowerCase() !== normalizedEmail
    ) {
      throw new Error("The saved franchisee identity does not match; no changes were made");
    }

    let existingAuthUser: { id: string; email?: string } | undefined;
    let page = 1;
    while (!existingAuthUser) {
      const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listError) throw new Error(listError.message);
      existingAuthUser = usersPage.users.find(
        (user) => user.email?.trim().toLowerCase() === normalizedEmail,
      );
      if (usersPage.users.length < 200) break;
      page += 1;
    }

    if (franchisee.user_id && franchisee.user_id !== existingAuthUser?.id) {
      throw new Error("This franchisee is already linked to a different account; no changes were made");
    }

    let authUserId = existingAuthUser?.id;
    let createdAuthUser = false;
    let temporaryPassword: string | null = null;
    let linkedByThisRun = false;
    let roleCreatedByThisRun = false;
    let credentialIdCreatedByThisRun: string | null = null;

    const compensate = async () => {
      if (createdAuthUser && authUserId) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        await supabaseAdmin.from("franchisees").update({ user_id: null }).eq("id", data.franchisee_id).eq("user_id", authUserId);
        return;
      }
      if (credentialIdCreatedByThisRun) {
        await supabaseAdmin.from("franchisee_credentials").delete().eq("id", credentialIdCreatedByThisRun);
      }
      if (linkedByThisRun && authUserId) {
        await supabaseAdmin.from("franchisees").update({ user_id: null }).eq("id", data.franchisee_id).eq("user_id", authUserId);
      }
      if (roleCreatedByThisRun && authUserId) {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", authUserId).eq("role", "franchisee");
      }
    };

    try {
      if (authUserId) {
        const [{ data: otherFranchisees, error: otherFranchiseError }, { data: stateLinks, error: stateLinkError }] =
          await Promise.all([
            supabaseAdmin.from("franchisees").select("id").eq("user_id", authUserId).neq("id", data.franchisee_id),
            supabaseAdmin.from("state_franchises").select("id").eq("user_id", authUserId),
          ]);
        if (otherFranchiseError || stateLinkError) throw new Error("Unable to verify existing account ownership");
        if ((otherFranchisees?.length ?? 0) > 0 || (stateLinks?.length ?? 0) > 0) {
          throw new Error("The existing account belongs to another franchise; no changes were made");
        }
      } else {
        temporaryPassword = generateTemporaryPassword();
        const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: TARGET_EMAIL,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { full_name: TARGET_NAME },
        });
        if (createError || !created.user) throw new Error(createError?.message ?? "Unable to create login account");
        authUserId = created.user.id;
        createdAuthUser = true;
      }

      const { data: currentLinks, error: currentLinksError } = await supabaseAdmin
        .from("franchisees")
        .select("id,user_id")
        .or(`id.eq.${data.franchisee_id},user_id.eq.${authUserId}`);
      if (currentLinksError) throw new Error(currentLinksError.message);
      const target = currentLinks?.find((row) => row.id === data.franchisee_id);
      const conflicting = currentLinks?.filter((row) => row.id !== data.franchisee_id && row.user_id === authUserId) ?? [];
      if (!target || (target.user_id && target.user_id !== authUserId) || conflicting.length > 0) {
        throw new Error("Ownership changed during processing; all new changes were rolled back");
      }

      if (!target.user_id) {
        const { data: linked, error: linkError } = await supabaseAdmin
          .from("franchisees")
          .update({ user_id: authUserId })
          .eq("id", data.franchisee_id)
          .is("user_id", null)
          .select("id")
          .maybeSingle();
        if (linkError || !linked) throw new Error(linkError?.message ?? "Franchise linkage changed during processing");
        linkedByThisRun = true;
      }

      const { data: existingRoles, error: roleLookupError } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", authUserId)
        .eq("role", "franchisee");
      if (roleLookupError) throw new Error(roleLookupError.message);
      if ((existingRoles?.length ?? 0) > 1) throw new Error("Multiple franchisee roles already exist; no further changes were made");
      if (existingRoles?.length === 0) {
        const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
          user_id: authUserId,
          role: "franchisee",
        });
        if (roleError) throw new Error(roleError.message);
        roleCreatedByThisRun = true;
      }

      const { data: existingCredentials, error: credentialLookupError } = await supabaseAdmin
        .from("franchisee_credentials")
        .select("id")
        .eq("franchisee_id", data.franchisee_id)
        .ilike("login_email", TARGET_EMAIL)
        .order("created_at", { ascending: true });
      if (credentialLookupError) throw new Error(credentialLookupError.message);
      let credentialId = existingCredentials?.[0]?.id;
      let credentialCreated = false;
      if (!credentialId) {
        const { data: credential, error: credentialError } = await supabaseAdmin
          .from("franchisee_credentials")
          .insert({ franchisee_id: data.franchisee_id, login_email: TARGET_EMAIL, created_by: context.userId })
          .select("id")
          .single();
        if (credentialError) throw new Error(credentialError.message);
        credentialId = credential.id;
        credentialIdCreatedByThisRun = credential.id;
        credentialCreated = true;
      }

      const [{ data: verifiedFranchisees }, { data: verifiedRoles }] = await Promise.all([
        supabaseAdmin.from("franchisees").select("id,user_id").eq("id", data.franchisee_id).eq("user_id", authUserId),
        supabaseAdmin.from("user_roles").select("id").eq("user_id", authUserId).eq("role", "franchisee"),
      ]);
      if (verifiedFranchisees?.length !== 1 || verifiedRoles?.length !== 1) {
        throw new Error("Final verification failed; all new changes were rolled back");
      }

      return {
        success: true,
        user_id: authUserId,
        auth_user: createdAuthUser ? "created" : "reused",
        temporary_password: createdAuthUser ? temporaryPassword : null,
        credential_record: credentialCreated ? "created" : "reused",
        credential_id: credentialId,
      };
    } catch (error) {
      await compensate();
      throw error;
    }
  });