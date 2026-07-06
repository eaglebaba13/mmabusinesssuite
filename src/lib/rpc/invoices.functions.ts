import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { supabase as browserSupabase } from "@/integrations/supabase/client";

const forwardAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await browserSupabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

const ENTITY_TYPES = ["company", "state_franchise", "city_franchise", "academy", "dark_store", "salon_branch", "department"] as const;
const DOC_TYPES = ["b2b_tax", "b2c", "proforma", "quotation", "receipt", "credit_note", "debit_note"] as const;
// Proforma is deprecated from the active billing flow. Existing proforma
// records are archived (soft-deleted) and remain readable for audit, but
// new proformas can no longer be created or edited through the app.
const DEPRECATED_DOC_TYPES = new Set(["proforma"]);

async function assertCanWrite(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r) => ["super_admin", "founder", "accounts", "nail_emporium"].includes(r.role));
  if (!ok) throw new Error("Not authorized");
}

function fyLabel(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(y).slice(-2)}-${String(y + 1).slice(-2)}`;
}

async function nextInvoiceNumber(company_id: string, doc_type: string): Promise<string> {
  const fy = fyLabel();
  // Try to grab existing rule
  const { data: rule } = await supabaseAdmin
    .from("invoice_numbering_rules")
    .select("*")
    .eq("company_id", company_id)
    .eq("doc_type", doc_type as any)
    .eq("financial_year", fy)
    .maybeSingle();

  let prefix = "INV";
  let format = "{PREFIX}/{FY}/{SEQ:5}";
  let seq = 1;
  let ruleId = rule?.id as string | undefined;

  if (rule) {
    prefix = rule.prefix;
    format = rule.format;
    seq = rule.current_seq + 1;
  } else {
    const { data: company } = await supabaseAdmin.from("companies").select("invoice_prefix,name").eq("id", company_id).single();
    const base = company?.invoice_prefix || (company?.name ? company.name.slice(0, 3).toUpperCase() : "INV");
    const suffix =
      doc_type === "b2c" ? "-BC" :
      doc_type === "proforma" ? "-PF" :
      doc_type === "quotation" ? "-QT" :
      doc_type === "receipt" ? "-RC" :
      doc_type === "credit_note" ? "-CN" :
      doc_type === "debit_note" ? "-DN" : "";
    prefix = base + suffix;
    const { data: ins } = await supabaseAdmin
      .from("invoice_numbering_rules")
      .insert({ company_id, doc_type: doc_type as any, prefix, financial_year: fy, current_seq: 0, format })
      .select("id")
      .single();
    ruleId = ins?.id;
  }

  // Update seq
  if (ruleId) await supabaseAdmin.from("invoice_numbering_rules").update({ current_seq: seq }).eq("id", ruleId);

  const seqMatch = format.match(/\{SEQ:(\d+)\}/);
  const pad = seqMatch ? Number(seqMatch[1]) : 5;
  return format.replace("{PREFIX}", prefix).replace("{FY}", fy).replace(/\{SEQ:\d+\}/, String(seq).padStart(pad, "0"));
}

type ItemIn = { quantity: number; unit_price: number; discount_pct: number; gst_pct: number };
function computeTotals(items: ItemIn[]) {
  let subtotal = 0, discount_total = 0, gst_total = 0;
  const lines = items.map((it) => {
    const gross = Number(it.quantity) * Number(it.unit_price);
    const disc = gross * Number(it.discount_pct) / 100;
    const net = gross - disc;
    const gst = net * Number(it.gst_pct) / 100;
    subtotal += gross; discount_total += disc; gst_total += gst;
    return { line_subtotal: net, line_gst: gst, line_total: net + gst };
  });
  const grand_total = subtotal - discount_total + gst_total;
  return { subtotal, discount_total, gst_total, grand_total, lines };
}

async function writeAudit(userId: string, action: string, entity_id: string, metadata: Record<string, unknown> = {}) {
  await supabaseAdmin.from("audit_logs").insert({ user_id: userId, action, entity: "invoice", entity_id, metadata } as any);
}

async function resolveAttributionChain(invoice_id: string) {
  const { data } = await supabaseAdmin
    .from("invoices")
    .select("franchisee_id, state_franchise_id, franchisees(full_name, territories(name, state)), state_franchises(full_name, state)")
    .eq("id", invoice_id)
    .maybeSingle();
  const f: any = data?.franchisees;
  const sf: any = data?.state_franchises;
  return {
    franchisee_id: data?.franchisee_id ?? null,
    state_franchise_id: data?.state_franchise_id ?? null,
    city_franchisee: f?.full_name ?? null,
    territory: f?.territories?.name ?? null,
    territory_state: f?.territories?.state ?? null,
    state_franchise: sf?.full_name ?? null,
    state_franchise_state: sf?.state ?? null,
  };
}

const ItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().min(0.001),
  unit_price: z.number().min(0),
  discount_pct: z.number().min(0).max(100).default(0),
  gst_pct: z.number().min(0).max(50).default(18),
  is_student_product: z.boolean().default(false),
});

const INVOICE_CATEGORIES = [
  "tns_turnover",
  "academy_sales",
  "mall_of_salon_sales",
  "franchise_fee",
  "royalty",
  "product_sales",
  "service_sales",
  "other",
] as const;
const FRANCHISE_MAPPING_TYPES = ["company_direct", "master", "state", "city"] as const;

const CreateInput = z.object({
  company_id: z.string().uuid(),
  doc_type: z.enum(DOC_TYPES),
  bill_to_company_id: z.string().uuid().optional().nullable(),
  bill_to_entity_type: z.enum(ENTITY_TYPES).optional().nullable(),
  bill_to_entity_id: z.string().uuid().optional().nullable(),
  bill_to_name: z.string().max(255).optional().nullable(),
  bill_to_gstin: z.string().max(20).optional().nullable(),
  place_of_supply: z.string().max(64).optional().nullable(),
  invoice_date: z.string(),
  due_date: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  franchisee_id: z.string().uuid().optional().nullable(),
  state_franchise_id: z.string().uuid().optional().nullable(),
  franchise_mapping_type: z.enum(FRANCHISE_MAPPING_TYPES).default("company_direct"),
  invoice_category: z.enum(INVOICE_CATEGORIES).default("other"),
  is_intercompany: z.boolean().optional().default(false),
  source_document_ref: z.string().max(120).optional().nullable(),
  source_document_url: z.string().max(2000).optional().nullable(),
  items: z.array(ItemSchema).min(1),
  issue: z.boolean().default(false),
  is_demo: z.boolean().default(false),
});

const TAX_DOC_TYPES = new Set(["b2b_tax", "credit_note", "debit_note"]);

function normState(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

async function resolveSellerState(company_id: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("companies").select("address").eq("id", company_id).maybeSingle();
  const addr = (data?.address ?? null) as any;
  const s = addr && typeof addr === "object" ? (addr.state ?? null) : null;
  return s ? String(s) : null;
}

function deriveTaxMode(fromState: string | null, placeOfSupply: string | null): "intra" | "inter" | null {
  if (!fromState || !placeOfSupply) return null;
  return normState(fromState) === normState(placeOfSupply) ? "intra" : "inter";
}

async function buildTaxFields(company_id: string, doc_type: string, place_of_supply: string | null | undefined, requireForIssue: boolean) {
  const fromState = await resolveSellerState(company_id);
  const pos = (place_of_supply ?? "").trim() || null;
  if (requireForIssue && TAX_DOC_TYPES.has(doc_type)) {
    if (!fromState) throw new Error("Seller company is missing state in its address. Update company address before issuing a B2B tax invoice.");
    if (!pos) throw new Error("Place of Supply is required to issue a B2B tax invoice.");
  }
  const tax_mode = deriveTaxMode(fromState, pos);
  return { from_state: fromState, place_of_supply: pos, tax_mode };
}

function splitGst(tax_mode: "intra" | "inter" | null, gst_total: number) {
  if (tax_mode === "inter") return { cgst_total: 0, sgst_total: 0, igst_total: gst_total };
  // intra OR unknown → split equally (matches legacy behavior; trigger keeps in sync)
  return { cgst_total: gst_total / 2, sgst_total: gst_total / 2, igst_total: 0 };
}

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.userId);
    if (DEPRECATED_DOC_TYPES.has(data.doc_type)) {
      throw new Error("Proforma invoices are deprecated. Use B2B Tax Invoice or B2C Invoice instead.");
    }
    const tax = await buildTaxFields(data.company_id, data.doc_type, data.place_of_supply, data.issue);
    const number = data.issue ? await nextInvoiceNumber(data.company_id, data.doc_type) : null;
    const totals = computeTotals(data.items);
    const split = splitGst(tax.tax_mode, totals.gst_total);
    const { data: inv, error } = await supabaseAdmin
      .from("invoices")
      .insert({
        company_id: data.company_id,
        doc_type: data.doc_type,
        bill_to_company_id: data.bill_to_company_id ?? null,
        bill_to_entity_type: data.bill_to_entity_type ?? null,
        bill_to_entity_id: data.bill_to_entity_id ?? null,
        bill_to_name: data.bill_to_name ?? null,
        bill_to_gstin: data.bill_to_gstin ?? null,
        place_of_supply: tax.place_of_supply,
        from_state: tax.from_state,
        tax_mode: tax.tax_mode,
        invoice_date: data.invoice_date,
        due_date: data.due_date ?? null,
        notes: data.notes ?? null,
        franchisee_id: data.franchisee_id ?? null,
        state_franchise_id: data.state_franchise_id ?? null,
        franchise_mapping_type: data.franchise_mapping_type ?? "company_direct",
        invoice_category: data.invoice_category ?? "other",
        is_intercompany: data.is_intercompany ?? false,
        source_document_ref: data.source_document_ref ?? null,
        source_document_url: data.source_document_url ?? null,
        invoice_number: number,
        status: data.issue ? "issued" : "draft",
        issued_at: data.issue ? new Date().toISOString() : null,
        issued_by: data.issue ? context.userId : null,
        is_demo: data.is_demo,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        gst_total: totals.gst_total,
        cgst_total: split.cgst_total,
        sgst_total: split.sgst_total,
        igst_total: split.igst_total,
        grand_total: totals.grand_total,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const items = data.items.map((it, idx) => ({ ...it, invoice_id: inv.id, ...totals.lines[idx] }));
    const { error: ie } = await supabaseAdmin.from("invoice_items").insert(items);
    if (ie) throw new Error(ie.message);
    await writeAudit(context.userId, data.issue ? "invoice.issue" : "invoice.create", inv.id, { doc_type: data.doc_type, grand_total: totals.grand_total, invoice_number: number, tax_mode: tax.tax_mode });
    if (data.source_document_ref || data.source_document_url) {
      await writeAudit(context.userId, "invoice.source_doc.set", inv.id, { source_document_ref: data.source_document_ref ?? null, source_document_url: data.source_document_url ?? null });
    }
    if (data.franchisee_id) {
      const chain = await resolveAttributionChain(inv.id);
      await writeAudit(context.userId, "invoice.attribution.set", inv.id, { source: "manual", ...chain });
    }
    return { id: inv.id, invoice_number: number };
  });

const UpdateInput = CreateInput.extend({ id: z.string().uuid() }).omit({ items: true, issue: true }).extend({
  items: z.array(ItemSchema).min(1).optional(),
});

export const updateInvoice = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.userId);
    if (DEPRECATED_DOC_TYPES.has(data.doc_type)) {
      throw new Error("Proforma invoices are deprecated and cannot be edited. Archived for audit only.");
    }
    const { id, items, ...patch } = data;
    // Snapshot existing values for diffing audit events
    const { data: before } = await supabaseAdmin
      .from("invoices")
      .select("source_document_ref, source_document_url, franchisee_id, state_franchise_id")
      .eq("id", id)
      .maybeSingle();
    const tax = await buildTaxFields(data.company_id, data.doc_type, data.place_of_supply, false);
    const fullPatch: Record<string, unknown> = {
      ...patch,
      place_of_supply: tax.place_of_supply,
      from_state: tax.from_state,
      tax_mode: tax.tax_mode,
    };
    let totals: ReturnType<typeof computeTotals> | null = null;
    if (items) {
      totals = computeTotals(items);
      const split = splitGst(tax.tax_mode, totals.gst_total);
      fullPatch.subtotal = totals.subtotal;
      fullPatch.discount_total = totals.discount_total;
      fullPatch.gst_total = totals.gst_total;
      fullPatch.cgst_total = split.cgst_total;
      fullPatch.sgst_total = split.sgst_total;
      fullPatch.igst_total = split.igst_total;
      fullPatch.grand_total = totals.grand_total;
    }
    // Super admins can edit invoices at any status; others only drafts.
    const { data: roleRows } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const isSuperAdmin = (roleRows ?? []).some((r) => r.role === "super_admin");
    let upd = supabaseAdmin.from("invoices").update(fullPatch as any).eq("id", id);
    if (!isSuperAdmin) upd = upd.eq("status", "draft");
    const { error } = await upd;
    if (error) throw new Error(error.message);
    if (items && totals) {
      await supabaseAdmin.from("invoice_items").delete().eq("invoice_id", id);
      await supabaseAdmin.from("invoice_items").insert(items.map((it, idx) => ({ ...it, invoice_id: id, ...totals!.lines[idx] })));
    }
    await writeAudit(context.userId, "invoice.update", id, { items_replaced: !!items, tax_mode: tax.tax_mode });

    // Diff-based audit for source document + attribution
    const beforeRef = before?.source_document_ref ?? null;
    const beforeUrl = before?.source_document_url ?? null;
    const newRef = data.source_document_ref ?? null;
    const newUrl = data.source_document_url ?? null;
    if (beforeRef !== newRef || beforeUrl !== newUrl) {
      await writeAudit(context.userId, "invoice.source_doc.change", id, {
        ref: { from: beforeRef, to: newRef },
        url: { from: beforeUrl, to: newUrl },
      });
    }
    const beforeFr = before?.franchisee_id ?? null;
    const newFr = data.franchisee_id ?? null;
    if (beforeFr !== newFr) {
      const chain = await resolveAttributionChain(id);
      await writeAudit(context.userId, "invoice.attribution.override", id, {
        source: "manual",
        previous_franchisee_id: beforeFr,
        ...chain,
      });
    }
    return { ok: true };
  });

export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.userId);
    const { data: inv } = await supabaseAdmin.from("invoices").select("id,company_id,doc_type,status,invoice_number,grand_total,place_of_supply,from_state").eq("id", data.id).single();
    if (!inv) throw new Error("Not found");
    if (inv.status !== "draft") throw new Error("Already issued");
    if (TAX_DOC_TYPES.has(inv.doc_type)) {
      if (!inv.from_state) throw new Error("Seller company is missing state. Update company address before issuing a B2B tax invoice.");
      if (!inv.place_of_supply) throw new Error("Place of Supply is required to issue a B2B tax invoice.");
    }
    const number = inv.invoice_number ?? (await nextInvoiceNumber(inv.company_id, inv.doc_type));
    const { error } = await supabaseAdmin.from("invoices").update({
      status: "issued", invoice_number: number, issued_at: new Date().toISOString(), issued_by: context.userId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(context.userId, "invoice.issue", data.id, { invoice_number: number, grand_total: inv.grand_total });
    return { invoice_number: number };
  });

export const cancelInvoice = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), reason: z.string().min(1).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.userId);
    const { error } = await supabaseAdmin.from("invoices").update({
      status: "cancelled", cancellation_reason: data.reason,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(context.userId, "invoice.cancel", data.id, { reason: data.reason });
    return { ok: true };
  });

const DeleteReasonCodes = ["duplicate", "wrong_party", "wrong_amount", "test_cleanup", "created_by_mistake", "other"] as const;
const DeleteInput = z.object({
  id: z.string().uuid(),
  reason_code: z.enum(DeleteReasonCodes),
  reason_detail: z.string().trim().min(1).max(1000),
});

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteInput.parse(i))
  .handler(async ({ data, context }) => {
    // Strict role gate — Super Admin only.
    const { data: rolesRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (rolesRows ?? []).map((r) => r.role);
    if (!roles.includes("super_admin")) {
      throw new Error("Only Super Admin can delete invoices.");
    }
    if (data.reason_code === "other" && data.reason_detail.trim().length < 3) {
      throw new Error("Please provide an explanation when selecting Other.");
    }
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("id,invoice_number,doc_type,status,grand_total,bill_to_name,company_id,archived_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!inv) throw new Error("Invoice not found");
    if (inv.archived_at) throw new Error("Invoice is already deleted/archived.");

    const fullReason = `[${data.reason_code}] ${data.reason_detail}`;
    const { error } = await supabaseAdmin
      .from("invoices")
      .update({
        archived_at: new Date().toISOString(),
        archived_reason: fullReason,
        archived_by: context.userId,
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await writeAudit(context.userId, "invoice.delete", data.id, {
      soft_delete: true,
      invoice_number: inv.invoice_number,
      doc_type: inv.doc_type,
      previous_status: inv.status,
      grand_total: inv.grand_total,
      bill_to_name: inv.bill_to_name,
      reason_code: data.reason_code,
      reason_detail: data.reason_detail,
      role: "super_admin",
      removed_from: ["revenue", "receivables", "payouts", "active_reports"],
    });
    return { ok: true };
  });

export const reviseInvoice = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.userId);
    const { data: orig } = await supabaseAdmin.from("invoices").select("*").eq("id", data.id).single();
    if (!orig) throw new Error("Not found");
    const { data: items } = await supabaseAdmin.from("invoice_items").select("*").eq("invoice_id", data.id);

    const itemsForTotals = (items ?? []).map((it: any) => ({
      quantity: Number(it.quantity), unit_price: Number(it.unit_price),
      discount_pct: Number(it.discount_pct), gst_pct: Number(it.gst_pct),
    }));
    const totals = computeTotals(itemsForTotals);

    const { data: rev, error } = await supabaseAdmin.from("invoices").insert({
      company_id: orig.company_id,
      doc_type: orig.doc_type,
      bill_to_company_id: orig.bill_to_company_id,
      bill_to_entity_type: orig.bill_to_entity_type,
      bill_to_entity_id: orig.bill_to_entity_id,
      bill_to_name: orig.bill_to_name,
      bill_to_gstin: orig.bill_to_gstin,
      place_of_supply: orig.place_of_supply,
      from_state: orig.from_state,
      tax_mode: orig.tax_mode,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: orig.due_date,
      notes: orig.notes,
      parent_invoice_id: orig.id,
      revision_no: (orig.revision_no ?? 0) + 1,
      status: "draft",
      is_demo: orig.is_demo,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      gst_total: totals.gst_total,
      cgst_total: orig.tax_mode === "inter" ? 0 : totals.gst_total / 2,
      sgst_total: orig.tax_mode === "inter" ? 0 : totals.gst_total / 2,
      igst_total: orig.tax_mode === "inter" ? totals.gst_total : 0,
      grand_total: totals.grand_total,
      // Carry attribution + traceability across revisions so franchise
      // dashboards keep matching the latest active version.
      franchisee_id: orig.franchisee_id,
      state_franchise_id: orig.state_franchise_id,
      is_intercompany: orig.is_intercompany,
      source_document_ref: orig.source_document_ref,
      source_document_url: orig.source_document_url,
    }).select("id").single();
    if (error) throw new Error(error.message);

    if (items?.length) {
      await supabaseAdmin.from("invoice_items").insert(items.map((it: any, idx: number) => ({
        invoice_id: rev.id,
        description: it.description, quantity: it.quantity, unit_price: it.unit_price,
        discount_pct: it.discount_pct, gst_pct: it.gst_pct, is_student_product: it.is_student_product,
        product_id: it.product_id,
        ...totals.lines[idx],
      })));
    }
    await supabaseAdmin.from("invoices").update({ status: "revised" }).eq("id", orig.id);
    await writeAudit(context.userId, "invoice.revise", orig.id, { revision_id: rev.id, revision_no: (orig.revision_no ?? 0) + 1 });
    return { id: rev.id };
  });

const NumberRuleInput = z.object({
  id: z.string().uuid().optional(),
  company_id: z.string().uuid(),
  doc_type: z.enum(DOC_TYPES),
  prefix: z.string().min(1).max(20),
  financial_year: z.string().min(3).max(10),
  current_seq: z.number().int().min(0),
  format: z.string().min(3).max(50),
});
export const upsertNumberingRule = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => NumberRuleInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.userId);
    const { id, ...patch } = data;
    if (id) {
      const { error } = await supabaseAdmin.from("invoice_numbering_rules").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("invoice_numbering_rules").insert(patch);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
