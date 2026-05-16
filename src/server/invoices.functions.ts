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
  invoice_date: z.string(),
  due_date: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(ItemSchema).min(1),
  issue: z.boolean().default(false),
  is_demo: z.boolean().default(false),
});

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.userId);
    const number = data.issue ? await nextInvoiceNumber(data.company_id, data.doc_type) : null;
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
        invoice_date: data.invoice_date,
        due_date: data.due_date ?? null,
        notes: data.notes ?? null,
        invoice_number: number,
        status: data.issue ? "issued" : "draft",
        issued_at: data.issue ? new Date().toISOString() : null,
        issued_by: data.issue ? context.userId : null,
        is_demo: data.is_demo,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const items = data.items.map((it) => ({ ...it, invoice_id: inv.id }));
    const { error: ie } = await supabaseAdmin.from("invoice_items").insert(items);
    if (ie) throw new Error(ie.message);
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
    const { error } = await supabaseAdmin.from("invoices").update(patch).eq("id", id).eq("status", "draft");
    if (error) throw new Error(error.message);
    if (items) {
      await supabaseAdmin.from("invoice_items").delete().eq("invoice_id", id);
      await supabaseAdmin.from("invoice_items").insert(items.map((it) => ({ ...it, invoice_id: id })));
    }
    return { ok: true };
  });

export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([forwardAuth, requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.userId);
    const { data: inv } = await supabaseAdmin.from("invoices").select("id,company_id,doc_type,status,invoice_number").eq("id", data.id).single();
    if (!inv) throw new Error("Not found");
    if (inv.status !== "draft") throw new Error("Already issued");
    const number = inv.invoice_number ?? (await nextInvoiceNumber(inv.company_id, inv.doc_type));
    const { error } = await supabaseAdmin.from("invoices").update({
      status: "issued", invoice_number: number, issued_at: new Date().toISOString(), issued_by: context.userId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
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
    }).select("id").single();
    if (error) throw new Error(error.message);

    if (items?.length) {
      await supabaseAdmin.from("invoice_items").insert(items.map((it: any) => ({
        invoice_id: rev.id,
        description: it.description, quantity: it.quantity, unit_price: it.unit_price,
        discount_pct: it.discount_pct, gst_pct: it.gst_pct, is_student_product: it.is_student_product,
        product_id: it.product_id,
      })));
    }
    await supabaseAdmin.from("invoices").update({ status: "revised" }).eq("id", orig.id);
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
