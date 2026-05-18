import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { supabase as browserSupabase } from "@/integrations/supabase/client";

const forwardAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await browserSupabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

const ENTITY_TYPES = [
  "company",
  "state_franchise",
  "city_franchise",
  "academy",
  "dark_store",
  "salon_branch",
  "department",
] as const;

// Single source of truth for what counts as franchise external revenue.
// Both the impersonation entity dashboard and the franchisee self-dashboard
// MUST use this rule, otherwise the two views disagree on the same data.
export const REVENUE_DOC_TYPES = new Set(["b2b_tax", "b2c", "debit_note"]);
export const REVENUE_STATUSES = new Set(["issued", "paid", "partial"]);

export function partitionRevenueInvoices<T extends {
  doc_type: string; status: string | null; is_intercompany: boolean | null;
  archived_at?: string | null;
}>(rows: T[]): { included: T[]; excluded: Array<T & { exclusion_reason: string }> } {
  const included: T[] = [];
  const excluded: Array<T & { exclusion_reason: string }> = [];
  for (const r of rows) {
    let reason: string | null = null;
    if (r.archived_at) reason = "archived";
    else if (r.is_intercompany === true) reason = "intercompany";
    else if (!REVENUE_DOC_TYPES.has(r.doc_type)) reason = `non_revenue_doc:${r.doc_type}`;
    else if (!r.status || !REVENUE_STATUSES.has(r.status)) reason = `excluded_status:${r.status ?? "null"}`;
    if (reason) excluded.push({ ...r, exclusion_reason: reason });
    else included.push(r);
  }
  return { included, excluded };
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r) => r.role === "super_admin" || r.role === "founder");
  if (!ok) throw new Error("Admin only");
}

function hashToken(t: string) {
  return crypto.createHash("sha256").update(t).digest("hex");
}

const StartInput = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
  mode: z.enum(["read_only", "read_write"]).default("read_only"),
});

export const startImpersonation = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => StartInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    const { data: row, error } = await supabaseAdmin
      .from("impersonation_sessions")
      .insert({
        acting_admin_id: context.userId,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        mode: data.mode,
        token_hash: hashToken(token),
        expires_at: expires.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("impersonation_audit").insert({
      session_id: row.id,
      action: "start",
      payload: { entity_type: data.entity_type, entity_id: data.entity_id, mode: data.mode },
    });
    return { token, expires_at: expires.toISOString() };
  });

const ResolveInput = z.object({ token: z.string().min(20) });

export const resolveImpersonation = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ResolveInput.parse(i))
  .handler(async ({ data }) => {
    // Token itself is the auth secret (sha256-hashed, time-limited, audit-logged).
    // No session required — viewer may be opened cross-origin where the admin
    // session isn't available.
    const hash = hashToken(data.token);
    const { data: sess, error } = await supabaseAdmin
      .from("impersonation_sessions")
      .select("*")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error || !sess) throw new Error("Invalid impersonation token");
    if (sess.ended_at) throw new Error("Impersonation session ended");
    if (new Date(sess.expires_at).getTime() < Date.now()) throw new Error("Impersonation token expired");

    // Resolve entity name
    let name = "Entity";
    let extra: any = {};
    if (sess.entity_type === "state_franchise") {
      const { data: e } = await supabaseAdmin.from("state_franchises").select("full_name,state,investment_amount").eq("id", sess.entity_id).maybeSingle();
      name = e?.full_name ?? name;
      extra = e ?? {};
    } else if (sess.entity_type === "city_franchise") {
      const { data: e } = await supabaseAdmin.from("franchisees").select("full_name,investment_amount,base_roi_pct,emporium_pct,academy_pct,dark_store_pct").eq("id", sess.entity_id).maybeSingle();
      name = e?.full_name ?? name;
      extra = e ?? {};
    } else if (sess.entity_type === "salon_branch") {
      const { data: e } = await supabaseAdmin.from("salon_branches").select("name,city,state,parent_brand,service_catalog").eq("id", sess.entity_id).maybeSingle();
      name = e?.name ?? name;
      extra = e ?? {};
    } else if (sess.entity_type === "company") {
      const { data: e } = await supabaseAdmin.from("companies").select("name,company_type").eq("id", sess.entity_id).maybeSingle();
      name = e?.name ?? name;
      extra = e ?? {};
    } else if (sess.entity_type === "academy" || sess.entity_type === "dark_store") {
      const { data: e } = await supabaseAdmin.from("franchisees").select("full_name").eq("id", sess.entity_id).maybeSingle();
      name = e?.full_name ?? name;
      extra = e ?? {};
    }

    const { data: admin } = await supabaseAdmin.from("profiles").select("full_name,email").eq("id", sess.acting_admin_id).maybeSingle();

    await supabaseAdmin.from("impersonation_audit").insert({
      session_id: sess.id,
      action: "resolve",
      payload: { by: context.userId },
    });

    return {
      session_id: sess.id,
      entity_type: sess.entity_type,
      entity_id: sess.entity_id,
      mode: sess.mode,
      expires_at: sess.expires_at,
      name,
      extra,
      acting_admin: admin ?? null,
    };
  });

export const listActiveImpersonationSessions = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: sessions } = await supabaseAdmin
      .from("impersonation_sessions")
      .select("id,acting_admin_id,entity_type,entity_id,mode,expires_at,ended_at,started_at")
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("started_at", { ascending: false });

    const rows = sessions ?? [];
    const adminIds = Array.from(new Set(rows.map((r) => r.acting_admin_id)));
    const { data: admins } = adminIds.length
      ? await supabaseAdmin.from("profiles").select("id,full_name,email").in("id", adminIds)
      : { data: [] as any[] };

    const enriched = await Promise.all(rows.map(async (s) => {
      let name = "Entity";
      try {
        if (s.entity_type === "state_franchise") {
          const { data } = await supabaseAdmin.from("state_franchises").select("full_name").eq("id", s.entity_id).maybeSingle();
          name = data?.full_name ?? name;
        } else if (s.entity_type === "city_franchise" || s.entity_type === "academy" || s.entity_type === "dark_store") {
          const { data } = await supabaseAdmin.from("franchisees").select("full_name").eq("id", s.entity_id).maybeSingle();
          name = data?.full_name ?? name;
        } else if (s.entity_type === "salon_branch") {
          const { data } = await supabaseAdmin.from("salon_branches").select("name").eq("id", s.entity_id).maybeSingle();
          name = data?.name ?? name;
        } else if (s.entity_type === "company") {
          const { data } = await supabaseAdmin.from("companies").select("name").eq("id", s.entity_id).maybeSingle();
          name = data?.name ?? name;
        }
      } catch { /* ignore */ }
      const admin = (admins ?? []).find((a: any) => a.id === s.acting_admin_id);
      return { ...s, entity_name: name, admin_name: admin?.full_name ?? admin?.email ?? "—" };
    }));
    return { sessions: enriched };
  });

export const revokeImpersonationSession = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ session_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", data.session_id)
      .is("ended_at", null);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("impersonation_audit").insert({
      session_id: data.session_id, action: "end", payload: { revoked_by: context.userId },
    });
    return { ok: true };
  });

const EndInput = z.object({ token: z.string().min(20) });
export const endImpersonation = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => EndInput.parse(i))
  .handler(async ({ data }) => {
    const hash = hashToken(data.token);
    const { data: sess } = await supabaseAdmin
      .from("impersonation_sessions")
      .select("id")
      .eq("token_hash", hash)
      .maybeSingle();
    if (!sess) return { ok: true };
    await supabaseAdmin.from("impersonation_sessions").update({ ended_at: new Date().toISOString() }).eq("id", sess.id);
    await supabaseAdmin.from("impersonation_audit").insert({ session_id: sess.id, action: "end" });
    return { ok: true };
  });

// Lightweight data-fetch for impersonation viewer (admin reads via supabaseAdmin scoped to entity)
const ViewInput = z.object({ token: z.string().min(20) });
export const fetchImpersonationData = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => ViewInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const hash = hashToken(data.token);
    const { data: sess } = await supabaseAdmin
      .from("impersonation_sessions")
      .select("*")
      .eq("token_hash", hash)
      .maybeSingle();
    if (!sess || sess.ended_at || new Date(sess.expires_at).getTime() < Date.now()) {
      throw new Error("Session invalid");
    }

    const out: any = {};
    if (sess.entity_type === "state_franchise") {
      const [roi, inc, targets, cities] = await Promise.all([
        supabaseAdmin.from("state_franchise_roi_ledger").select("*").eq("state_franchise_id", sess.entity_id).order("period_month", { ascending: false }).limit(24),
        supabaseAdmin.from("state_franchise_incentive_ledger").select("*").eq("state_franchise_id", sess.entity_id).order("period_month", { ascending: false }).limit(50),
        supabaseAdmin.from("state_franchise_targets").select("*").eq("state_franchise_id", sess.entity_id).order("contract_year"),
        supabaseAdmin.from("territories").select("id,name,franchisees(id,full_name,status,joined_at,investment_amount)").eq("state_franchise_id", sess.entity_id),
      ]);
      out.roi = roi.data ?? [];
      out.incentives = inc.data ?? [];
      out.targets = targets.data ?? [];
      out.cities = cities.data ?? [];
    } else if (sess.entity_type === "city_franchise" || sess.entity_type === "academy" || sess.entity_type === "dark_store") {
      // Pull every mapped invoice (billed TO this entity OR attributed via
      // franchisee_id), then partition into revenue-bearing vs excluded so
      // both the entity dashboard and the franchisee self-dashboard apply
      // the SAME rule: only final outward tax invoices count as revenue.
      const [allInvoices, payments] = await Promise.all([
        supabaseAdmin
          .from("invoices")
          .select("id,invoice_number,doc_type,grand_total,amount_paid,payment_status,invoice_date,status,franchisee_id,bill_to_entity_id,bill_to_entity_type,is_intercompany,parent_invoice_id,archived_at")
          .or(`and(bill_to_entity_type.eq.${sess.entity_type},bill_to_entity_id.eq.${sess.entity_id}),franchisee_id.eq.${sess.entity_id}`)
          .order("invoice_date", { ascending: false })
          .limit(200),
        supabaseAdmin.from("payments").select("*").eq("counterparty_entity_id", sess.entity_id).order("payment_date", { ascending: false }).limit(50),
      ]);
      const partitioned = partitionRevenueInvoices(allInvoices.data ?? []);
      out.invoices = partitioned.included;
      out.excluded_invoices = partitioned.excluded;
      out.payments = payments.data ?? [];
    } else if (sess.entity_type === "salon_branch") {
      const { data: branch } = await supabaseAdmin.from("salon_branches").select("*").eq("id", sess.entity_id).maybeSingle();
      out.branch = branch;
    }
    return out;
  });
