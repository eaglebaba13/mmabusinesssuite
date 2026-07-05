import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as browserSupabase } from "@/integrations/supabase/client";

// Forwards the user's Supabase access token so requireSupabaseAuth can read it.
const forwardAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await browserSupabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

async function assertAdmin(userId: string) {
  // Reuse existing is_admin() helper (super_admin OR founder)
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden — admin access required");
}

// ---------- Schemas ----------
const CommissionInput = z.object({
  kind: z.enum([
    "one_time",
    "monthly",
    "royalty",
    "profit_share",
    "recurring",
    "bonus",
    "performance_incentive",
    "referral_bonus",
  ]),
  label: z.string().min(1).max(120),
  amount: z.number().nullable().optional(),
  percent: z.number().min(0).max(100).nullable().optional(),
  frequency: z.enum(["one_time", "monthly", "quarterly", "yearly", "on_event"]).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});

const ProductInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  brand_name: z.string().max(120).nullable().optional(),
  brand_logo_url: z.string().url().nullable().optional().or(z.literal("")),
  category: z.string().max(80).nullable().optional(),
  type_id: z.string().uuid().nullable().optional(),
  revenue_model_id: z.string().uuid().nullable().optional(),

  investment_amount: z.number().min(0).default(0),
  gst_percent: z.number().min(0).max(100).default(18),
  security_deposit: z.number().min(0).default(0),
  lock_in_months: z.number().int().min(0).default(0),
  territory: z.string().max(120).nullable().optional(),

  royalty_percent: z.number().min(0).max(100).default(0),
  revenue_share_percent: z.number().min(0).max(100).default(0),
  minimum_guarantee: z.number().min(0).default(0),
  expected_roi_percent: z.number().min(0).max(1000).nullable().optional(),
  roi_timeline_months: z.number().int().min(0).max(600).nullable().optional(),
  profit_margin_percent: z.number().min(0).max(100).nullable().optional(),

  brochure_url: z.string().url().nullable().optional().or(z.literal("")),
  video_url: z.string().url().nullable().optional().or(z.literal("")),
  agreement_template: z.string().nullable().optional(),

  short_description: z.string().max(500).nullable().optional(),
  long_description: z.string().max(10000).nullable().optional(),
  highlights: z.array(z.string().max(200)).max(30).default([]),
  requirements: z.array(z.string().max(200)).max(30).default([]),

  status: z.enum(["active", "inactive", "archived", "draft"]).default("draft"),
  is_featured: z.boolean().default(false),

  commissions: z.array(CommissionInput).max(30).default([]),
});

const emptyToNull = (v?: string | null) => (v == null || v === "" ? null : v);

// ---------- Server functions ----------

export const listFranchiseProducts = createServerFn({ method: "GET" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("franchise_products" as never)
      .select(
        "id,name,brand_name,brand_logo_url,category,type_id,revenue_model_id,investment_amount,gst_percent,security_deposit,lock_in_months,territory,royalty_percent,revenue_share_percent,minimum_guarantee,expected_roi_percent,roi_timeline_months,profit_margin_percent,brochure_url,video_url,short_description,highlights,requirements,status,is_featured,created_at,updated_at",
      )
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown[] };
  });

export const listFranchiseProductTypes = createServerFn({ method: "GET" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("franchise_product_types" as never)
      .select("id,code,label,description,is_system,is_active,sort_order")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown[] };
  });

export const listRevenueModels = createServerFn({ method: "GET" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("franchise_revenue_models" as never)
      .select("id,code,name,description,is_active, franchise_revenue_model_splits(id,party_label,percent,sort_order,notes)")
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown[] };
  });

export const getFranchiseProduct = createServerFn({ method: "GET" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: product, error } = await context.supabase
      .from("franchise_products" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!product) throw new Error("Product not found");

    const [{ data: commissions }, { data: media }, { data: franchiseeCount }, { data: leadCount }] =
      await Promise.all([
        context.supabase
          .from("franchise_product_commissions" as never)
          .select("*")
          .eq("product_id", data.id)
          .order("sort_order"),
        context.supabase
          .from("franchise_product_media" as never)
          .select("*")
          .eq("product_id", data.id)
          .order("sort_order"),
        context.supabase
          .from("franchisees" as never)
          .select("id", { count: "exact", head: true })
          .eq("franchise_product_id", data.id),
        context.supabase
          .from("leads" as never)
          .select("id", { count: "exact", head: true })
          .eq("franchise_product_id", data.id),
      ]);

    return {
      product: product as unknown,
      commissions: (commissions ?? []) as unknown[],
      media: (media ?? []) as unknown[],
      counts: {
        franchisees: (franchiseeCount as unknown as { count?: number })?.count ?? 0,
        leads: (leadCount as unknown as { count?: number })?.count ?? 0,
      },
    };
  });

export const upsertFranchiseProduct = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => ProductInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { id, commissions, ...rest } = data;
    const payload = {
      ...rest,
      brand_logo_url: emptyToNull(rest.brand_logo_url as string | null | undefined),
      brochure_url: emptyToNull(rest.brochure_url as string | null | undefined),
      video_url: emptyToNull(rest.video_url as string | null | undefined),
    };

    let productId = id ?? null;
    if (id) {
      const { error } = await supabaseAdmin
        .from("franchise_products" as never)
        .update(payload)
        .eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("franchise_products" as never)
        .insert({ ...payload, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      productId = (inserted as { id: string }).id;
    }

    if (productId) {
      // Replace commissions atomically
      await supabaseAdmin
        .from("franchise_product_commissions" as never)
        .delete()
        .eq("product_id", productId);
      if (commissions.length) {
        const rows = commissions.map((c, idx) => ({
          product_id: productId!,
          kind: c.kind,
          label: c.label,
          amount: c.amount ?? null,
          percent: c.percent ?? null,
          frequency: c.frequency ?? null,
          notes: c.notes ?? null,
          sort_order: c.sort_order ?? idx,
        }));
        const { error: cErr } = await supabaseAdmin
          .from("franchise_product_commissions" as never)
          .insert(rows);
        if (cErr) throw new Error(cErr.message);
      }
    }

    return { id: productId };
  });

export const duplicateFranchiseProduct = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: orig, error } = await supabaseAdmin
      .from("franchise_products" as never)
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const src = orig as Record<string, unknown>;

    const {
      id: _id,
      created_at: _c,
      updated_at: _u,
      created_by: _cb,
      ...clone
    } = src;
    const { data: dup, error: dErr } = await supabaseAdmin
      .from("franchise_products" as never)
      .insert({
        ...clone,
        name: `${(src.name as string) ?? "Untitled"} (Copy)`,
        status: "draft",
        is_featured: false,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (dErr) throw new Error(dErr.message);

    const newId = (dup as { id: string }).id;
    const { data: commissions } = await supabaseAdmin
      .from("franchise_product_commissions" as never)
      .select("kind,label,amount,percent,frequency,notes,sort_order")
      .eq("product_id", data.id);
    if (commissions?.length) {
      await supabaseAdmin
        .from("franchise_product_commissions" as never)
        .insert(commissions.map((c) => ({ ...(c as object), product_id: newId })));
    }
    return { id: newId };
  });

export const archiveFranchiseProduct = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("franchise_products" as never)
      .update({ status: "archived" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setFranchiseProductStatus = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "inactive", "archived", "draft"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("franchise_products" as never)
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
