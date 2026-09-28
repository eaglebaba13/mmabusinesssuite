import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

const forwardAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  return next({ headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
});

export const getFranchiseCatalog = createServerFn({ method: "GET" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [franchiseResult, stateFranchiseResult] = await Promise.all([
      context.supabase.from("franchisees")
        .select("id").eq("user_id", context.userId).limit(1).maybeSingle(),
      context.supabase.from("state_franchises")
        .select("id").eq("user_id", context.userId).limit(1).maybeSingle(),
    ]);
    if (franchiseResult.error || stateFranchiseResult.error) {
      throw new Error("Unable to verify franchise access");
    }
    if (!franchiseResult.data && !stateFranchiseResult.data) {
      throw new Error("Franchise access required");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("products")
      .select("id, name, sku, description, category_id, unit, hsn_code, sale_price, mrp, image_url, low_stock_threshold, active")
      .eq("active", true).order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });