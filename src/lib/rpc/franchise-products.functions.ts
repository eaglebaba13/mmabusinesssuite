import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as browserSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// Forwards the user's Supabase access token so requireSupabaseAuth can read it.
const forwardAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await browserSupabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

// Loose Supabase client cast — new tables aren't in the generated types yet.
type LooseClient = SupabaseClient<any, any, any>;
const asLoose = (c: unknown) => c as LooseClient;

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden — admin access required");
}

// ---------- Row types (mirror the DB schema) ----------
export type FranchiseProductRow = {
  id: string;
  name: string;
  brand_name: string | null;
  brand_logo: string | null;
  category: string | null;
  type_id: string | null;
  revenue_model_id: string | null;
  investment_amount: number;
  gst_percent: number;
  security_deposit: number;
  lock_in_months: number;
  
  royalty_percent: number;
  revenue_share_percent: number;
  minimum_guarantee: number;
  expected_roi_percent: number | null;
  roi_timeline_months: number | null;
  profit_margin_percent: number | null;
  brochure_url: string | null;
  video_url: string | null;
  agreement_template: string | null;
  short_description: string | null;
  long_description: string | null;
  highlights: string[];
  requirements: string[];
  status: "active" | "inactive" | "archived" | "draft";
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export type FranchiseProductTypeRow = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
};

export type RevenueModelSplitRow = {
  id: string;
  party_label: string;
  percent: number;
  sort_order: number;
  notes: string | null;
};

export type RevenueModelRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  franchise_revenue_model_splits: RevenueModelSplitRow[];
};

export type ProductCommissionRow = {
  id: string;
  product_id: string;
  kind:
    | "one_time"
    | "monthly"
    | "royalty"
    | "profit_share"
    | "recurring"
    | "bonus"
    | "performance_incentive"
    | "referral_bonus";
  label: string;
  amount: number | null;
  percent: number | null;
  frequency: "one_time" | "monthly" | "quarterly" | "yearly" | "on_event" | null;
  notes: string | null;
  sort_order: number;
};

export type ProductMediaRow = {
  id: string;
  product_id: string;
  kind: "logo" | "image" | "video" | "brochure" | "document" | "marketing_kit";
  url: string;
  storage_path: string | null;
  file_name: string | null;
  content_type: string | null;
  caption: string | null;
  sort_order: number;
};

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
  brand_logo: z.string().nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  type_id: z.string().uuid().nullable().optional(),
  revenue_model_id: z.string().uuid().nullable().optional(),

  investment_amount: z.number().min(0).default(0),
  gst_percent: z.number().min(0).max(100).default(18),
  security_deposit: z.number().min(0).default(0),
  lock_in_months: z.number().int().min(0).default(0),

  royalty_percent: z.number().min(0).max(100).default(0),
  revenue_share_percent: z.number().min(0).max(100).default(0),
  minimum_guarantee: z.number().min(0).default(0),
  expected_roi_percent: z.number().min(0).max(1000).nullable().optional(),
  roi_timeline_months: z.number().int().min(0).max(600).nullable().optional(),
  profit_margin_percent: z.number().min(0).max(100).nullable().optional(),

  brochure_url: z.string().nullable().optional(),
  video_url: z.string().nullable().optional(),
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
  .handler(async ({ context }): Promise<{ rows: FranchiseProductRow[] }> => {
    const { data, error } = await asLoose(context.supabase)
      .from("franchise_products")
      .select(
        "id,name,brand_name,brand_logo,category,type_id,revenue_model_id,investment_amount,gst_percent,security_deposit,lock_in_months,royalty_percent,revenue_share_percent,minimum_guarantee,expected_roi_percent,roi_timeline_months,profit_margin_percent,brochure_url,video_url,agreement_template,short_description,long_description,highlights,requirements,status,is_featured,created_at,updated_at",
      )
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as FranchiseProductRow[] };
  });

export const listFranchiseProductTypes = createServerFn({ method: "GET" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: FranchiseProductTypeRow[] }> => {
    const { data, error } = await asLoose(context.supabase)
      .from("franchise_product_types")
      .select("id,code,label,description,is_system,is_active,sort_order")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as FranchiseProductTypeRow[] };
  });

export const listRevenueModels = createServerFn({ method: "GET" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: RevenueModelRow[] }> => {
    const { data, error } = await asLoose(context.supabase)
      .from("franchise_revenue_models")
      .select(
        "id,code,name,description,is_active,franchise_revenue_model_splits(id,party_label,percent,sort_order,notes)",
      )
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as RevenueModelRow[] };
  });

export const getFranchiseProduct = createServerFn({ method: "GET" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      product: FranchiseProductRow;
      commissions: ProductCommissionRow[];
      media: ProductMediaRow[];
      counts: { franchisees: number; leads: number };
    }> => {
      const sb = asLoose(context.supabase);
      const { data: product, error } = await sb
        .from("franchise_products")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!product) throw new Error("Product not found");

      const [
        { data: commissions },
        { data: media },
        { count: franchiseeCount },
        { count: leadCount },
      ] = await Promise.all([
        sb
          .from("franchise_product_commissions")
          .select("*")
          .eq("product_id", data.id)
          .order("sort_order"),
        sb
          .from("franchise_product_media")
          .select("*")
          .eq("product_id", data.id)
          .order("sort_order"),
        sb
          .from("franchisees")
          .select("id", { count: "exact", head: true })
          .eq("franchise_product_id", data.id),
        sb
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("franchise_product_id", data.id),
      ]);

      return {
        product: product as FranchiseProductRow,
        commissions: (commissions ?? []) as ProductCommissionRow[],
        media: (media ?? []) as ProductMediaRow[],
        counts: { franchisees: franchiseeCount ?? 0, leads: leadCount ?? 0 },
      };
    },
  );

export const upsertFranchiseProduct = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => ProductInput.parse(i))
  .handler(async ({ data, context }): Promise<{ id: string | null }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = asLoose(supabaseAdmin);

    const { id, commissions, ...rest } = data;
    const payload = {
      ...rest,
      brand_logo: emptyToNull(rest.brand_logo),
      brochure_url: emptyToNull(rest.brochure_url),
      video_url: emptyToNull(rest.video_url),
    };

    let productId: string | null = id ?? null;
    if (id) {
      const { error } = await sb.from("franchise_products").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await sb
        .from("franchise_products")
        .insert({ ...payload, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      productId = (inserted as { id: string }).id;
    }

    if (productId) {
      await sb.from("franchise_product_commissions").delete().eq("product_id", productId);
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
        const { error: cErr } = await sb.from("franchise_product_commissions").insert(rows);
        if (cErr) throw new Error(cErr.message);
      }
    }
    return { id: productId };
  });

export const duplicateFranchiseProduct = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = asLoose(supabaseAdmin);

    const { data: orig, error } = await sb.from("franchise_products").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const src = orig as Record<string, unknown>;

    const { id: _id, created_at: _c, updated_at: _u, created_by: _cb, ...clone } = src;
    void _id; void _c; void _u; void _cb;

    const { data: dup, error: dErr } = await sb
      .from("franchise_products")
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
    const { data: commissions } = await sb
      .from("franchise_product_commissions")
      .select("kind,label,amount,percent,frequency,notes,sort_order")
      .eq("product_id", data.id);
    if (commissions?.length) {
      await sb
        .from("franchise_product_commissions")
        .insert((commissions as Array<Record<string, unknown>>).map((c) => ({ ...c, product_id: newId })));
    }
    return { id: newId };
  });

export const setFranchiseProductStatus = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["active", "inactive", "archived", "draft"]) })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = asLoose(supabaseAdmin);
    const { error } = await sb.from("franchise_products").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
