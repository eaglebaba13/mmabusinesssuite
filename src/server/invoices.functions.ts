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

const ItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().min(0.001),
  unit_price: z.number().min(0),
  discount_pct: z.number().min(0).max(100).default(0),
  gst_pct: z.number().min(0).max(50).default(18),
  is_student_product: z.boolean().default(false),
});

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
    const { id, items, ...patch } = data;
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
    const { error } = await supabaseAdmin.from("invoices").update(fullPatch as any).eq("id", id).eq("status", "draft");
    if (error) throw new Error(error.message);
    if (items && totals) {
      await supabaseAdmin.from("invoice_items").delete().eq("invoice_id", id);
      await supabaseAdmin.from("invoice_items").insert(items.map((it, idx) => ({ ...it, invoice_id: id, ...totals!.lines[idx] })));
    }
    await writeAudit(context.userId, "invoice.update", id, { items_replaced: !!items, tax_mode: tax.tax_mode });
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

export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.userId);
    const { data: inv } = await supabaseAdmin.from("invoices").select("id,company_id,doc_type,status,invoice_number,grand_total").eq("id", data.id).single();
    if (!inv) throw new Error("Not found");
    if (inv.status !== "draft") throw new Error("Already issued");
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
      grand_total: totals.grand_total,
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
