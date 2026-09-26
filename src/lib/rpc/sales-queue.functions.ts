import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

const forwardAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  return next({ headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
});

async function requireSales(client: typeof supabase, userId: string) {
  const { data, error } = await client.from("user_roles").select("role").eq("user_id", userId).eq("role", "sales").maybeSingle();
  if (error || !data) throw new Error("Sales access required");
}

export const getUnassignedLeads = createServerFn({ method: "GET" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSales(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("leads")
      .select("id, city, source, stage, created_at")
      .is("assigned_to", null).order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const claimUnassignedLead = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireSales(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: claimed, error } = await supabaseAdmin.from("leads")
      .update({ assigned_to: context.userId })
      .eq("id", data.id).is("assigned_to", null).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return { claimed: !!claimed };
  });