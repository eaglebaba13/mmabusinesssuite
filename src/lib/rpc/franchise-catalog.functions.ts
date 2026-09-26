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
    const { data: franchisee, error: accessError } = await context.supabase.from("franchisees")
      .select("id").eq("user_id", context.userId).limit(1).maybeSingle();
    if (accessError || !franchisee) throw new Error("Franchise access required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("products")
      .select("id, name, sku, description, category_id, unit, hsn_code, sale_price, mrp, image_url, low_stock_threshold, active")
      .eq("active", true).order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });