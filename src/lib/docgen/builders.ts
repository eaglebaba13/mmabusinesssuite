// Reads existing MMA Business Suite records and maps them into DocModels.
// Single source of truth: nothing here recalculates approved financials and
// nothing is hard-coded — missing values render as "Not Available".
import { supabase } from "@/integrations/supabase/client";
import {
  COMPANY_BRAND,
  COMPANY_NAME,
  NA,
  amountInWords,
  docTypeDef,
  formatDMY,
  formatMonthYear,
  money,
  num,
  requireFields,
  safeFileName,
  txt,
  type DocBlock,
  type DocModel,
  type DocTypeKey,
  type SourceKind,
} from "./model";

export type SourceOption = { id: string; label: string; sub?: string };
export type Extras = Record<string, string>;

const FRANCHISEE_FIELDS =
  "id, full_name, auth_name, franchisee_code, address, email, phone, franchise_type, franchise_fee, franchise_commission_amount, agreement_number, agreement_version, agreement_date, agreement_expiry, joined_at, mg_percent, tns_percent, academy_percent, mall_percent, royalty_percent, territory_country, territory_state, territory_district, territory_city, territory_area, territory_pincode, territory_start_date, territory_end_date, territory_id, warehouse_id, bank_name, bank_account_holder, bank_account_number, bank_ifsc, bank_branch, gst_number, pan_number, franchise_product_id, manager_user_id";

type Franchisee = Record<string, unknown> & { id: string };

const pct = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? NA : `${Number(v)}%`);

async function getFranchisee(id: string): Promise<Franchisee> {
  const { data, error } = await supabase.from("franchisees").select(FRANCHISEE_FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Required information missing: Franchisee record");
  return data as unknown as Franchisee;
}

async function resolveLocation(f: Franchisee): Promise<{ location: string; territory: string }> {
  const s = (k: string) => {
    const v = f[k];
    return v != null && String(v).trim() ? String(v).trim() : null;
  };
  let city = s("territory_city") || s("territory_district");
  let state = s("territory_state");
  let area = s("territory_area");

  if ((!city || !state) && f.territory_id) {
    const { data } = await supabase.from("territories").select("name, region, state").eq("id", f.territory_id as string).maybeSingle();
    if (data) {
      city = city || data.region || data.name;
      state = state || data.state;
      area = area || data.name;
    }
  }
  if (!city || !state) {
    const q = supabase.from("warehouses").select("name, city, state").limit(1);
    const { data } = f.warehouse_id
      ? await q.eq("id", f.warehouse_id as string).maybeSingle()
      : await q.eq("franchisee_id", f.id).maybeSingle();
    if (data) {
      city = city || data.city;
      state = state || data.state;
      area = area || data.city || data.name;
    }
  }
  const location = [city, state].filter(Boolean).join(", ") || NA;
  return { location, territory: area || city || state || NA };
}

function franchiseeName(f: Franchisee) {
  return txt(f.full_name);
}

/* ----------------------------- source pickers ----------------------------- */

export async function listSources(kind: SourceKind): Promise<SourceOption[]> {
  switch (kind) {
    case "roi_payout": {
      const { data, error } = await supabase
        .from("roi_payouts")
        .select("id, payout_month, total_amount, final_payable, status, franchisees(full_name, franchisee_code)")
        .order("payout_month", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const f = r.franchisees as { full_name?: string; franchisee_code?: string } | null;
        return {
          id: r.id,
          label: `${f?.full_name ?? "Franchisee"} — ${formatMonthYear(r.payout_month)}`,
          sub: `Rs. ${money(r.total_amount ?? r.final_payable)} • ${r.status}${f?.franchisee_code ? ` • ${f.franchisee_code}` : ""}`,
        };
      });
    }
    case "agreement": {
      const { data, error } = await supabase
        .from("franchise_agreements")
        .select("id, version, status, valid_from, valid_till, franchisees(full_name, franchisee_code)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const f = r.franchisees as { full_name?: string; franchisee_code?: string } | null;
        return {
          id: r.id,
          label: `${f?.full_name ?? "Franchisee"} — v${r.version ?? "1"}`,
          sub: `${r.status} • ${formatDMY(r.valid_from)} to ${formatDMY(r.valid_till)}`,
        };
      });
    }
    case "invoice": {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, bill_to_name, grand_total, payment_status")
        .is("archived_at", null)
        .order("invoice_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        label: `${r.invoice_number ?? "Draft"} — ${r.bill_to_name ?? NA}`,
        sub: `${formatDMY(r.invoice_date)} • Rs. ${money(r.grand_total)} • ${r.payment_status}`,
      }));
    }
    case "payment": {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, payment_date, method, counterparty_name, reference, direction")
        .eq("direction", "in")
        .order("payment_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      const ledger = (data ?? []).map((r) => ({
        id: r.id,
        label: `${r.counterparty_name ?? NA} — Rs. ${money(r.amount)}`,
        sub: `${formatDMY(r.payment_date)} • ${r.method}${r.reference ? ` • ${r.reference}` : ""}`,
      }));
      // POS collections are stored against sales orders, so offer them too.
      const { data: pos, error: posErr } = await supabase
        .from("sale_payments")
        .select("id, amount, method, reference, paid_at, sales_orders(invoice_number, customer_name)")
        .order("paid_at", { ascending: false })
        .limit(300);
      if (posErr) throw posErr;
      const posOptions = (pos ?? []).map((r) => {
        const o = r.sales_orders as { invoice_number?: string; customer_name?: string } | null;
        return {
          id: `sp:${r.id}`,
          label: `${o?.customer_name?.trim() || "Walk-in Customer"} — Rs. ${money(r.amount)}`,
          sub: `${formatDMY(r.paid_at)} • ${r.method} • POS ${o?.invoice_number ?? ""}`.trim(),
        };
      });
      return [...ledger, ...posOptions];
    }
    case "purchase_order": {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, order_date, total_amount, status, suppliers(name)")
        .order("order_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        label: `${r.po_number} — ${(r.suppliers as { name?: string } | null)?.name ?? NA}`,
        sub: `${formatDMY(r.order_date)} • Rs. ${money(r.total_amount)} • ${r.status}`,
      }));
    }
    case "employee": {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, employee_code, designation, status")
        .order("full_name")
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        label: `${r.full_name}${r.employee_code ? ` (${r.employee_code})` : ""}`,
        sub: `${r.designation ?? NA} • ${r.status}`,
      }));
    }
    case "franchisee": {
      const { data, error } = await supabase
        .from("franchisees")
        .select("id, full_name, franchisee_code, territory_city, status")
        .order("full_name")
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        label: `${r.full_name ?? NA}${r.franchisee_code ? ` (${r.franchisee_code})` : ""}`,
        sub: `${r.territory_city ?? NA} • ${r.status}`,
      }));
    }
    case "none":
    default:
      return [];
  }
}

/* -------------------------------- builders -------------------------------- */

export async function buildModel(opts: {
  docType: DocTypeKey;
  sourceId: string | null;
  docNumber: string;
  extras?: Extras;
}): Promise<{ model: DocModel; links: Record<string, string | null>; sourceKey: string | null }> {
  const def = docTypeDef(opts.docType);
  const extras = opts.extras ?? {};
  if (def.source !== "none" && !opts.sourceId) {
    throw new Error("Required information missing: Source record");
  }
  switch (opts.docType) {
    case "roi_claim":
      return roiClaim(opts.sourceId!, opts.docNumber, extras);
    case "payout_statement":
      return payoutStatement(opts.sourceId!, opts.docNumber);
    case "franchise_agreement":
      return agreement(opts.sourceId!, opts.docNumber);
    case "invoice":
      return invoice(opts.sourceId!, opts.docNumber);
    case "payment_receipt":
      return receipt(opts.sourceId!, opts.docNumber, extras);
    case "purchase_order":
      return purchaseOrder(opts.sourceId!, opts.docNumber, extras);
    case "offer_letter":
      return offerLetter(opts.sourceId!, opts.docNumber, extras);
    case "franchise_confirmation":
    case "franchise_onboarding":
    case "franchise_renewal":
    case "franchise_termination":
      return franchiseLetter(opts.docType, opts.sourceId!, opts.docNumber, extras);
    case "official_letter":
      return officialLetter(opts.docNumber, extras);
  }
}

/* 1. ROI CLAIM ------------------------------------------------------------ */

export const ACTIVITY_TYPES = [
  "Offline Promotions / Events",
  "Dealer Meet / Influencer Program",
  "POP / Branding / Display Materials",
  "Training / Workshop Expenses",
];

async function roiClaim(payoutId: string, docNumber: string, extras: Extras) {
  const { data: payout, error } = await supabase.from("roi_payouts").select("*").eq("id", payoutId).maybeSingle();
  if (error) throw error;
  if (!payout) throw new Error("Required information missing: ROI payout record");
  const f = await getFranchisee(payout.franchisee_id);
  const { location, territory } = await resolveLocation(f);

  const fixRoi = num(payout.base_roi ?? payout.mg_amount);
  const tns = num(payout.tns_amount ?? payout.emporium_incentive);
  const academy = num(payout.academy_amount ?? payout.academy_incentive);
  const mall = num(payout.mall_amount ?? payout.dark_store_incentive);
  const royaltyPct = num(f.royalty_percent);
  const royalty = 0; // no approved royalty component exists on the payout record
  const netPayable = num(payout.total_amount ?? payout.final_payable);

  requireFields({
    "City Franchisee Name": f.full_name,
    "Claim Period": payout.payout_month,
    "NET PAYABLE AMOUNT": netPayable > 0 ? netPayable : null,
  });

  const claimPeriod = formatMonthYear(payout.payout_month);
  const activityType = extras.activityType?.trim() || ACTIVITY_TYPES[0];
  const description =
    extras.description?.trim() ||
    txt(payout.payable_reason) ||
    "Approved ROI claim for the period as per the applicable franchise agreement.";

  const blocks: DocBlock[] = [
    { kind: "heading", text: "1.  DEALER DETAILS" },
    {
      kind: "table",
      head: ["Particulars", "Details"],
      widths: [4, 6],
      rows: [
        ["City Franchisee Name", franchiseeName(f)],
        ["Franchisee Auth. Name", txt(f.auth_name ?? f.full_name)],
        ["Franchisee Code", txt(f.franchisee_code)],
        ["Franchisee Address", txt(f.address)],
        ["Email ID", txt(f.email)],
        ["Location", location],
        ["Territory", territory],
      ],
    },
    { kind: "heading", text: "2.  ACTIVITY / EXPENSE DETAILS" },
    {
      kind: "table",
      head: ["Sr. No.", "Activity Type / Description", "Amount (Rs.)"],
      widths: [1, 6, 3],
      rightAlignFrom: 2,
      rows: [["1.", `${activityType}\n${description}`, money(netPayable)]],
    },
    { kind: "paragraph", text: `Total Claimed Amount: Rs. ${money(netPayable)}`, bold: true },
    { kind: "heading", text: "3.  ACTIVITY TYPES" },
    { kind: "bullets", items: ACTIVITY_TYPES },
    { kind: "heading", text: "4.  SUMMARY OF CLAIM" },
    {
      kind: "table",
      head: ["Particular", "Amount (Rs.)"],
      widths: [6, 4],
      rightAlignFrom: 1,
      boldLastRow: true,
      rows: [
        [`Fix ${pct(f.mg_percent)} ROI Claimed`, money(fixRoi)],
        [`TNS Turnover Claim (${pct(f.tns_percent)})`, money(tns)],
        [`Academy (${pct(f.academy_percent)})`, money(academy)],
        [`Mall of Salon / Online (${pct(f.mall_percent)})`, money(mall)],
        [`Royalty (${pct(f.royalty_percent)})`, money(royalty)],
        ["NET PAYABLE AMOUNT (Rs.)", money(netPayable)],
      ],
    },
    { kind: "paragraph", text: `Amount in words: ${amountInWords(netPayable)}` },
    { kind: "heading", text: "5.  BANK DETAILS (for Reimbursement)" },
    {
      kind: "kv",
      rows: [
        ["Bank Name:", txt(f.bank_name)],
        ["Account Holder Name:", txt(f.bank_account_holder ?? f.full_name)],
        ["Account Number:", txt(f.bank_account_number)],
        ["IFSC Code:", txt(f.bank_ifsc)],
        ["Branch:", txt(f.bank_branch)],
      ],
    },
    { kind: "heading", text: "6.  DEALER DECLARATION" },
    {
      kind: "paragraph",
      text: "I hereby declare that the information and expenses submitted above are true and supported with valid documents (bills/invoices/photos/reports).",
    },
    {
      kind: "signature",
      caption: "Authorized Signatory with seal & stamp",
      name: txt(f.auth_name ?? f.full_name),
      subline: `Date: ${formatDMY(new Date())}`,
    },
  ];
  if (royaltyPct > 0 && royalty === 0) {
    blocks.splice(blocks.length - 6, 0, {
      kind: "paragraph",
      text: "Royalty is shown as Rs. 0.00 where no approved royalty amount exists for this claim period.",
    });
  }

  const model: DocModel = {
    docType: "roi_claim",
    docNumber,
    title: "FRANCHISEE ROI CLAIM",
    fileBase: safeFileName(`ROI Claim - ${franchiseeName(f)} - ${claimPeriod} - ${docNumber}`),
    meta: [
      ["City Franchisee Name:", franchiseeName(f)],
      ["Franchisee Auth. Name:", txt(f.auth_name ?? f.full_name)],
      ["Franchisee Code:", txt(f.franchisee_code)],
      ["Claim Period:", claimPeriod],
      ["Date of Submission:", formatDMY(new Date())],
      ["Claim Reference No.:", docNumber],
    ],
    blocks,
  };
  return { model, links: { franchisee_id: f.id, payout_id: payoutId }, sourceKey: `roi_payout:${payoutId}` };
}

/* 5. PAYOUT STATEMENT ----------------------------------------------------- */

async function payoutStatement(payoutId: string, docNumber: string) {
  const { data: payout, error } = await supabase.from("roi_payouts").select("*").eq("id", payoutId).maybeSingle();
  if (error) throw error;
  if (!payout) throw new Error("Required information missing: ROI payout record");
  const f = await getFranchisee(payout.franchisee_id);

  const roi = num(payout.base_roi ?? payout.mg_amount);
  const tns = num(payout.tns_amount ?? payout.emporium_incentive);
  const academy = num(payout.academy_amount ?? payout.academy_incentive);
  const mall = num(payout.mall_amount ?? payout.dark_store_incentive);
  const totalPayable = num(payout.total_amount ?? payout.final_payable);
  const components = roi + tns + academy + mall;
  const adjustments = Number((totalPayable - components).toFixed(2));

  requireFields({ "Franchisee Name": f.full_name, "Payout Period": payout.payout_month, "Net Payable": totalPayable });

  const model: DocModel = {
    docType: "payout_statement",
    docNumber,
    title: "FRANCHISEE PAYOUT STATEMENT",
    fileBase: safeFileName(`Payout Statement - ${franchiseeName(f)} - ${formatMonthYear(payout.payout_month)} - ${docNumber}`),
    meta: [
      ["Franchisee Name:", franchiseeName(f)],
      ["Franchisee Code:", txt(f.franchisee_code)],
      ["Payout Period:", formatMonthYear(payout.payout_month)],
      ["Payout Reference:", docNumber],
      ["Payment Status:", txt(payout.status)],
    ],
    blocks: [
      { kind: "heading", text: "PAYOUT BREAK-UP" },
      {
        kind: "table",
        head: ["Particular", "Amount (Rs.)"],
        widths: [6, 4],
        rightAlignFrom: 1,
        boldLastRow: true,
        rows: [
          [`Fix ${pct(f.mg_percent)} ROI`, money(roi)],
          ["TNS", money(tns)],
          ["Academy", money(academy)],
          ["Mall of Salon / Online", money(mall)],
          ["Total Payable", money(components)],
          ["Adjustments", money(adjustments)],
          ["NET PAYABLE (Rs.)", money(totalPayable)],
        ],
      },
      { kind: "paragraph", text: `Amount in words: ${amountInWords(totalPayable)}` },
      { kind: "paragraph", text: `Calculation basis: ${txt(payout.payable_reason)}` },
      {
        kind: "kv",
        rows: [
          ["Payment Status:", txt(payout.status)],
          ["Paid On:", payout.paid_at ? formatDMY(payout.paid_at) : NA],
        ],
      },
      { kind: "signature", caption: "Authorized Signatory", name: COMPANY_NAME, seal: true, line: false },
    ],
  };
  return { model, links: { franchisee_id: f.id, payout_id: payoutId }, sourceKey: `payout_statement:${payoutId}` };
}

/* 2. FRANCHISE AGREEMENT -------------------------------------------------- */

type AgreementRow = {
  id: string | null;
  product_id: string | null;
  version: string | null;
  status: string | null;
  valid_from: string | null;
  valid_till: string | null;
  template_snapshot: string | null;
  merged_html: string | null;
};

async function agreement(franchiseeId: string, docNumber: string) {
  const f = await getFranchisee(franchiseeId);
  // Use the executed agreement record when one exists; otherwise fall back to
  // the agreement terms stored on the franchisee record itself.
  const { data: agRow } = await supabase
    .from("franchise_agreements")
    .select("id, product_id, version, status, valid_from, valid_till, template_snapshot, merged_html")
    .eq("franchisee_id", franchiseeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ag: AgreementRow = agRow ?? {
    id: null,
    product_id: (f.franchise_product_id as string) ?? null,
    version: (f.agreement_version as string) ?? "1",
    status: f.agreement_number ? "signed" : "draft",
    valid_from: (f.agreement_date as string) ?? (f.joined_at as string) ?? null,
    valid_till: (f.agreement_expiry as string) ?? null,
    template_snapshot: null,
    merged_html: null,
  };
  const { location, territory } = await resolveLocation(f);

  let productName = NA;
  if (ag.product_id || f.franchise_product_id) {
    const { data } = await supabase
      .from("franchise_products")
      .select("name, brand_name")
      .eq("id", (ag.product_id ?? f.franchise_product_id) as string)
      .maybeSingle();
    if (data) productName = txt(data.name);
  }

  requireFields({
    "Franchisee Name": f.full_name,
    "Agreement Version": ag.version ?? f.agreement_version,
    "Agreement Date": ag.valid_from ?? f.agreement_date,
  });

  const clauses = (ag.merged_html || ag.template_snapshot || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const blocks: DocBlock[] = [
    { kind: "heading", text: "1.  PARTIES & FRANCHISE DETAILS" },
    {
      kind: "table",
      head: ["Particulars", "Details"],
      widths: [4, 6],
      rows: [
        ["Franchisee Name", franchiseeName(f)],
        ["Authorized Name", txt(f.auth_name ?? f.full_name)],
        ["Franchisee Code", txt(f.franchisee_code)],
        ["Franchise Type", txt(f.franchise_type)],
        ["Franchise Product", productName],
        ["Territory", territory],
        ["Location", location],
        ["Agreement Version", txt(ag.version ?? f.agreement_version)],
        ["Agreement Date", formatDMY(ag.valid_from ?? (f.agreement_date as string))],
        ["Expiry Date", formatDMY(ag.valid_till ?? (f.agreement_expiry as string))],
      ],
    },
    { kind: "heading", text: "2.  COMMERCIAL TERMS" },
    {
      kind: "table",
      head: ["Particular", "Value"],
      widths: [6, 4],
      rightAlignFrom: 1,
      rows: [
        ["Franchise Fee", `Rs. ${money(f.franchise_fee)}`],
        ["Custom Fee / Franchise Commission", `Rs. ${money(f.franchise_commission_amount)}`],
        ["MG %", pct(f.mg_percent)],
        ["TNS %", pct(f.tns_percent)],
        ["Academy %", pct(f.academy_percent)],
        ["Mall of Salon %", pct(f.mall_percent)],
        ["Royalty %", pct(f.royalty_percent)],
      ],
    },
  ];

  if (clauses.length) {
    blocks.push({ kind: "heading", text: "3.  AGREEMENT TERMS & CLAUSES" });
    clauses.forEach((c) => blocks.push({ kind: "paragraph", text: c }));
  } else {
    blocks.push({ kind: "heading", text: "3.  AGREEMENT TERMS & CLAUSES" });
    blocks.push({
      kind: "paragraph",
      text: "Agreement terms are as per the executed agreement on record. No approved clause text is stored against this agreement record.",
    });
  }

  blocks.push(
    { kind: "heading", text: "4.  EXECUTION" },
    { kind: "signature", caption: `Authorized Signatory, ${COMPANY_NAME}`, seal: true, line: false },
    { kind: "signature", caption: "Franchisee Signature", name: txt(f.auth_name ?? f.full_name) },
  );

  const model: DocModel = {
    docType: "franchise_agreement",
    docNumber,
    title: "FRANCHISE AGREEMENT",
    fileBase: safeFileName(`Franchise Agreement - ${franchiseeName(f)} - ${docNumber}`),
    meta: [
      ["Franchisee Name:", franchiseeName(f)],
      ["Franchisee Code:", txt(f.franchisee_code)],
      ["Agreement No.:", txt(f.agreement_number ?? docNumber)],
      ["Agreement Version:", txt(ag.version ?? f.agreement_version)],
      ["Agreement Date:", formatDMY(ag.valid_from ?? (f.agreement_date as string))],
      ["Status:", txt(ag.status)],
    ],
    blocks,
  };
  return {
    model,
    links: { franchisee_id: f.id, agreement_id: ag.id },
    sourceKey: `agreement:${ag.id ?? f.id}`,
  };
}

/* 3. INVOICE -------------------------------------------------------------- */

async function invoice(invoiceId: string, docNumber: string) {
  const { data: inv, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (error) throw error;
  if (!inv) throw new Error("Required information missing: Invoice record");
  const { data: items, error: iErr } = await supabase
    .from("invoice_items")
    .select("description, hsn_code, quantity, unit_price, discount_pct, gst_pct, line_subtotal, line_gst, line_total")
    .eq("invoice_id", invoiceId);
  if (iErr) throw iErr;

  let franchiseeCode = NA;
  if (inv.franchisee_id) {
    const { data } = await supabase.from("franchisees").select("franchisee_code").eq("id", inv.franchisee_id).maybeSingle();
    franchiseeCode = txt(data?.franchisee_code);
  }

  requireFields({ "Invoice Number": inv.invoice_number, "Invoice Date": inv.invoice_date, "Bill To": inv.bill_to_name });

  const addr = inv.bill_to_address as Record<string, unknown> | null;
  const addressText = addr
    ? [addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ") || NA
    : NA;
  const taxable = num(inv.subtotal) - num(inv.discount_total);

  const model: DocModel = {
    docType: "invoice",
    docNumber,
    title: "TAX INVOICE",
    fileBase: safeFileName(`Invoice - ${inv.invoice_number} - ${docNumber}`),
    meta: [
      ["Invoice Number:", txt(inv.invoice_number)],
      ["Invoice Date:", formatDMY(inv.invoice_date)],
      ["Due Date:", formatDMY(inv.due_date)],
      ["Document Type:", txt(inv.doc_type)],
      ["Place of Supply:", txt(inv.place_of_supply)],
    ],
    blocks: [
      { kind: "heading", text: "BILL TO" },
      {
        kind: "kv",
        rows: [
          ["Name:", txt(inv.bill_to_name)],
          ["Address:", addressText],
          ["GSTIN:", txt(inv.bill_to_gstin)],
          ["Franchisee Code:", franchiseeCode],
        ],
      },
      { kind: "heading", text: "INVOICE DETAILS" },
      {
        kind: "table",
        head: ["Description", "HSN", "Qty", "Rate (Rs.)", "Taxable (Rs.)", "GST (Rs.)", "Total (Rs.)"],
        widths: [5, 2, 1.4, 2.2, 2.4, 2.2, 2.4],
        rightAlignFrom: 2,
        rows: (items ?? []).length
          ? (items ?? []).map((it) => [
              txt(it.description),
              txt(it.hsn_code),
              String(num(it.quantity)),
              money(it.unit_price),
              money(it.line_subtotal),
              money(it.line_gst),
              money(it.line_total),
            ])
          : [[txt(inv.notes), NA, "1", money(inv.subtotal), money(taxable), money(inv.gst_total), money(inv.grand_total)]],
      },
      {
        kind: "table",
        head: ["Particular", "Amount (Rs.)"],
        widths: [6, 4],
        rightAlignFrom: 1,
        boldLastRow: true,
        rows: [
          ["Subtotal", money(inv.subtotal)],
          ["Discount", money(inv.discount_total)],
          ["Taxable Amount", money(taxable)],
          ["CGST", money(inv.cgst_total)],
          ["SGST", money(inv.sgst_total)],
          ["IGST", money(inv.igst_total)],
          ["TOTAL (Rs.)", money(inv.grand_total)],
        ],
      },
      { kind: "paragraph", text: `Amount in words: ${amountInWords(inv.grand_total)}` },
      {
        kind: "kv",
        rows: [
          ["Payment Status:", txt(inv.payment_status)],
          ["Amount Paid:", `Rs. ${money(inv.amount_paid)}`],
          ["Balance Due:", `Rs. ${money(num(inv.grand_total) - num(inv.amount_paid))}`],
        ],
      },
      { kind: "paragraph", text: "This is a computer-generated tax invoice issued by " + COMPANY_NAME + "." },
    ],
  };
  return { model, links: { invoice_id: invoiceId, franchisee_id: (inv.franchisee_id as string) ?? null }, sourceKey: `invoice:${invoiceId}` };
}

/* 4. PAYMENT RECEIPT ------------------------------------------------------ */

type ReceiptSource = {
  amount: unknown;
  payment_date: unknown;
  method: unknown;
  reference: unknown;
  status: unknown;
  counterparty_name: unknown;
  counterparty_entity_type?: string | null;
  counterparty_entity_id?: string | null;
  invoice_id?: string | null;
};

async function receipt(paymentId: string, docNumber: string, extras: Extras) {
  const isPos = paymentId.startsWith("sp:");
  let p: ReceiptSource;
  let posInvoiceNumber: string | null = null;
  let posFranchiseeId: string | null = null;

  if (isPos) {
    const { data, error } = await supabase
      .from("sale_payments")
      .select("id, amount, method, reference, paid_at, sales_orders(invoice_number, customer_name, franchisee_id, payment_status)")
      .eq("id", paymentId.slice(3))
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Required information missing: Payment record");
    const o = data.sales_orders as
      | { invoice_number?: string; customer_name?: string; franchisee_id?: string; payment_status?: string }
      | null;
    posInvoiceNumber = o?.invoice_number ?? null;
    posFranchiseeId = o?.franchisee_id ?? null;
    p = {
      amount: data.amount,
      payment_date: data.paid_at,
      method: data.method,
      reference: data.reference,
      status: o?.payment_status ?? "paid",
      counterparty_name: o?.customer_name?.trim() || "Walk-in Customer",
      invoice_id: null,
    };
  } else {
    const { data, error } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Required information missing: Payment record");
    p = data as unknown as ReceiptSource;
  }

  let against = extras.paymentAgainst?.trim() || NA;
  let franchiseeCode = NA;
  let franchiseeId: string | null = null;
  if (p.invoice_id) {
    const { data: inv } = await supabase
      .from("invoices")
      .select("invoice_number, invoice_category, franchisee_id")
      .eq("id", p.invoice_id)
      .maybeSingle();
    if (inv) {
      against = extras.paymentAgainst?.trim() || `Invoice ${txt(inv.invoice_number)}`;
      franchiseeId = inv.franchisee_id ?? null;
    }
  }
  if (posInvoiceNumber) against = extras.paymentAgainst?.trim() || `POS Invoice ${posInvoiceNumber}`;
  if (!franchiseeId) franchiseeId = posFranchiseeId;
  if (!franchiseeId && p.counterparty_entity_type === "city_franchise") franchiseeId = p.counterparty_entity_id ?? null;
  if (franchiseeId) {
    const { data } = await supabase.from("franchisees").select("franchisee_code").eq("id", franchiseeId).maybeSingle();
    franchiseeCode = txt(data?.franchisee_code);
  }

  requireFields({ "Received From": p.counterparty_name, "Amount Received": num(p.amount) > 0 ? p.amount : null, "Payment Date": p.payment_date });

  const model: DocModel = {
    docType: "payment_receipt",
    docNumber,
    title: "PAYMENT RECEIPT",
    fileBase: safeFileName(`Payment Receipt - ${txt(p.counterparty_name)} - ${docNumber}`),
    meta: [
      ["Receipt No.:", docNumber],
      ["Receipt Date:", formatDMY(new Date())],
      ["Payment Date:", formatDMY(p.payment_date as string | null)],
    ],
    blocks: [
      {
        kind: "table",
        head: ["Particulars", "Details"],
        widths: [4, 6],
        rows: [
          ["Received From", txt(p.counterparty_name)],
          ["Franchisee Code", franchiseeCode],
          ["Payment Against", against],
          ["Amount Received", `Rs. ${money(p.amount)}`],
          ["Payment Method", txt(p.method)],
          ["Transaction / UTR No.", txt(p.reference)],
          ["Payment Status", txt(p.status)],
        ],
      },
      { kind: "paragraph", text: `Amount in words: ${amountInWords(p.amount)}`, bold: true },
      { kind: "paragraph", text: "Received with thanks, subject to realisation of the instrument where applicable." },
      { kind: "signature", caption: "Authorized Signatory", name: COMPANY_NAME, seal: true, line: false },
    ],
  };
  return {
    model,
    links: { payment_id: isPos ? null : paymentId, franchisee_id: franchiseeId },
    sourceKey: `payment:${paymentId}`,
  };
}

/* 6. PURCHASE ORDER ------------------------------------------------------- */

async function purchaseOrder(poId: string, docNumber: string, extras: Extras) {
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select("*, suppliers(name, gstin, address, city, state), warehouses(name, city, state, franchisee_id)")
    .eq("id", poId)
    .maybeSingle();
  if (error) throw error;
  if (!po) throw new Error("Required information missing: Purchase order record");

  const { data: items, error: iErr } = await supabase
    .from("purchase_order_items")
    .select("ordered_qty, unit_cost, products(name, mrp, sku)")
    .eq("po_id", poId);
  if (iErr) throw iErr;

  const wh = po.warehouses as { name?: string; city?: string; state?: string; franchisee_id?: string | null } | null;
  let franchiseeName_ = NA;
  let franchiseeId: string | null = wh?.franchisee_id ?? null;
  let territory = [wh?.city, wh?.state].filter(Boolean).join(", ") || NA;
  if (franchiseeId) {
    const f = await getFranchisee(franchiseeId);
    franchiseeName_ = franchiseeName(f);
    territory = (await resolveLocation(f)).territory;
  }

  requireFields({ "Purchase Order No.": po.po_number, "Order Date": po.order_date });

  const rows = (items ?? []).map((it, i) => {
    const prod = it.products as { name?: string; mrp?: number } | null;
    const qty = num(it.ordered_qty);
    const mrp = num(prod?.mrp);
    return [String(i + 1), txt(prod?.name), String(qty), money(mrp), money(qty * mrp)];
  });
  const totalMrp = (items ?? []).reduce((a, it) => {
    const prod = it.products as { mrp?: number } | null;
    return a + num(it.ordered_qty) * num(prod?.mrp);
  }, 0);
  const saleAmount = num(po.total_amount);
  const margin = Number((totalMrp - saleAmount).toFixed(2));
  const totalQty = (items ?? []).reduce((a, it) => a + num(it.ordered_qty), 0);
  const productSummary =
    (items ?? [])
      .map((it) => (it.products as { name?: string } | null)?.name)
      .filter(Boolean)
      .join(", ") || NA;

  const model: DocModel = {
    docType: "purchase_order",
    docNumber,
    title: "PURCHASE ORDER",
    fileBase: safeFileName(`Purchase Order - ${po.po_number} - ${docNumber}`),
    meta: [
      ["Purchase Order No.:", txt(po.po_number)],
      ["Order Date:", formatDMY(po.order_date)],
      ["Buyer:", `${COMPANY_NAME} (${COMPANY_BRAND})`],
      ["Supplier:", txt((po.suppliers as { name?: string } | null)?.name)],
      ["Franchisee:", franchiseeName_],
      ["Territory:", territory],
      ["Purpose:", extras.purpose?.trim() || txt(po.notes)],
    ],
    blocks: [
      { kind: "heading", text: "PURCHASE DETAILS" },
      {
        kind: "table",
        head: ["S.No.", "Product Name", "Qty", "MRP (Rs.)", "Amount (Rs.)"],
        widths: [1, 6, 1.5, 2, 2.5],
        rightAlignFrom: 2,
        boldLastRow: true,
        rows: rows.length ? [...rows, ["", "Total MRP Value", String(totalQty), "", money(totalMrp)]] : [["1", NA, "0", "0.00", "0.00"]],
      },
      { kind: "heading", text: "COMMERCIAL TERMS" },
      {
        kind: "table",
        head: ["Particular", "Amount (Rs.)"],
        widths: [6, 4],
        rightAlignFrom: 1,
        boldLastRow: true,
        rows: [
          ["Total Sale Amount", money(saleAmount)],
          ["Academy Trading Margin", money(margin)],
          ["Total Order Value (Rs.)", money(saleAmount)],
        ],
      },
      { kind: "heading", text: "DELIVERY PURPOSE" },
      {
        kind: "paragraph",
        text: `The above-mentioned ${productSummary} are being procured for training and educational use at the academy operated under ${franchiseeName_} Franchisee.`,
      },
      { kind: "heading", text: "ORDER SUMMARY" },
      {
        kind: "kv",
        rows: [
          ["Product:", productSummary],
          ["Quantity:", String(totalQty)],
          ["Total MRP:", `Rs. ${money(totalMrp)}`],
          ["Sale Amount:", `Rs. ${money(saleAmount)}`],
          ["Academy Trading Margin:", `Rs. ${money(margin)}`],
          ["Final Order Value:", `Rs. ${money(saleAmount)}`],
        ],
      },
      { kind: "signature", caption: `For ${COMPANY_BRAND} — Authorized Signatory`, seal: true, line: false },
    ],
  };
  return { model, links: { purchase_order_id: poId, franchisee_id: franchiseeId }, sourceKey: `purchase_order:${poId}` };
}

/* 7. OFFER LETTER -------------------------------------------------------- */

async function offerLetter(employeeId: string, docNumber: string, extras: Extras) {
  const { data: e, error } = await supabase.from("employees").select("*").eq("id", employeeId).maybeSingle();
  if (error) throw error;
  if (!e) throw new Error("Required information missing: Employee record");

  let department = NA;
  if (e.department_id) {
    const { data } = await supabase.from("departments").select("name").eq("id", e.department_id).maybeSingle();
    department = txt(data?.name);
  }
  const { data: org } = await supabase
    .from("org_settings")
    .select("org_name, contact_phone, contact_email")
    .limit(1)
    .maybeSingle();

  requireFields({
    "Employee Full Name": e.full_name,
    Designation: e.designation,
    "Monthly Salary": num(e.monthly_ctc) > 0 ? e.monthly_ctc : null,
  });

  const salary = num(e.monthly_ctc);
  const model: DocModel = {
    docType: "offer_letter",
    docNumber,
    title: "OFFER LETTER",
    fileBase: safeFileName(`Offer Letter - ${e.full_name} - ${docNumber}`),
    meta: [
      ["Reference No.:", docNumber],
      ["Date:", formatDMY(new Date())],
    ],
    blocks: [
      { kind: "paragraph", text: "To," },
      { kind: "paragraph", text: txt(e.full_name), bold: true },
      { kind: "paragraph", text: `(Aadhaar No. ${txt(e.aadhar)}, PAN No. ${txt(e.pan)})` },
      {
        kind: "kv",
        rows: [
          ["DOB:", formatDMY(e.date_of_birth)],
          ["R/o:", txt([e.address, e.city, e.state].filter(Boolean).join(", "))],
          ["Mobile:", txt(e.phone)],
          ["Email:", txt(e.email)],
        ],
      },
      {
        kind: "paragraph",
        text: `We are pleased to offer you employment with Mall of Salon / ${COMPANY_BRAND}. Based on your profile and discussion, you have been selected for the role under the following terms:`,
      },
      { kind: "heading", text: "POSITION DETAILS" },
      {
        kind: "kv",
        rows: [
          ["Designation:", txt(e.designation)],
          ["Region:", txt(extras.region?.trim() || e.state)],
          ["Department:", department],
          ["Employment Type:", txt(e.employment_type)],
          ["Date of Joining:", formatDMY(e.date_of_joining)],
        ],
      },
      { kind: "heading", text: "COMPENSATION STRUCTURE" },
      {
        kind: "kv",
        rows: [
          ["Fixed Salary:", `Rs. ${money(salary)}/- per month`],
          ["Salary in Words:", amountInWords(salary)],
        ],
      },
      { kind: "heading", text: "PERFORMANCE TARGET" },
      {
        kind: "paragraph",
        text:
          extras.performanceTarget?.trim() ||
          "Performance targets will be assigned by the reporting manager in line with the applicable business plan.",
      },
      {
        kind: "paragraph",
        text: "Performance will be reviewed monthly. Failure to meet applicable targets may lead to performance review or corrective action as per company policy.",
      },
      { kind: "heading", text: "WORKING HOURS" },
      {
        kind: "paragraph",
        text: "Standard working hours will be communicated by the reporting manager. Flexibility may be required based on business needs.",
      },
      { kind: "heading", text: "PROBATION PERIOD" },
      { kind: "paragraph", text: extras.probationPeriod?.trim() || "Six (6) months from the date of joining." },
      { kind: "paragraph", text: "Confirmation will be based on performance and target achievement." },
      { kind: "heading", text: "CONFIDENTIALITY CLAUSE" },
      { kind: "paragraph", text: "You shall maintain strict confidentiality of:" },
      {
        kind: "bullets",
        items: [
          "Franchise leads & database",
          "Business strategies",
          "Pricing & expansion plans",
          "Customer information",
          "Internal business processes",
          "Financial and commercial information",
        ],
      },
      { kind: "heading", text: "NON-COMPETE & CONDUCT" },
      {
        kind: "paragraph",
        text: "You shall not engage in unauthorized competing business activities during employment. You must maintain professional conduct with clients, franchise partners, employees and management.",
      },
      { kind: "heading", text: "TERMINATION POLICY" },
      {
        kind: "kv",
        rows: [
          ["During probation:", extras.probationNotice?.trim() || "15 days' notice from either side."],
          ["After confirmation:", extras.postConfirmationNotice?.trim() || "30 days' notice from either side."],
        ],
      },
      { kind: "paragraph", text: "Immediate termination/action may apply in cases including:" },
      {
        kind: "bullets",
        items: [
          "Fraud or misconduct",
          "Target manipulation",
          "Data misuse",
          "Confidentiality breach",
          "Serious violation of company policy",
        ],
      },
      { kind: "heading", text: "DOCUMENTS REQUIRED" },
      {
        kind: "bullets",
        items: [
          "Identity proof (Aadhaar / PAN)",
          "Address Verification",
          "Experience Certificates",
          "Educational Certificates",
          "Passport size photographs",
          "Bank Details",
        ],
      },
      { kind: "heading", text: "WELCOME NOTE" },
      {
        kind: "paragraph",
        text: "We welcome you to the Mall of Salon Family and look forward to your contribution to the growth and expansion of the organization.",
      },
      { kind: "heading", text: "DECLARATION" },
      { kind: "paragraph", text: "I have read and agree to the terms mentioned above." },
      { kind: "signature", caption: "Employee Signature", name: txt(e.full_name), subline: `Date: ${formatDMY(new Date())}` },
      {
        kind: "signature",
        caption: `Warm regards, ${extras.signatoryName?.trim() || "Authorized Signatory"}${extras.signatoryDesignation?.trim() ? `, ${extras.signatoryDesignation.trim()}` : ""}`,
        name: COMPANY_NAME,
        subline: `${COMPANY_BRAND}${org?.contact_phone ? ` • Mobile: ${org.contact_phone}` : ""}${org?.contact_email ? ` • ${org.contact_email}` : ""}`,
        seal: true,
        line: false,
      },
    ],
  };
  return { model, links: { employee_id: employeeId }, sourceKey: `offer_letter:${employeeId}` };
}

/* 8-11. FRANCHISE LETTERS ------------------------------------------------- */

async function franchiseLetter(docType: DocTypeKey, franchiseeId: string, docNumber: string, extras: Extras) {
  const f = await getFranchisee(franchiseeId);
  const { location, territory } = await resolveLocation(f);
  requireFields({ "Franchisee Name": f.full_name });

  let managerName = NA;
  if (f.manager_user_id) {
    const { data } = await supabase.from("profiles").select("full_name").eq("id", f.manager_user_id as string).maybeSingle();
    managerName = txt(data?.full_name);
  }

  const core: [string, string][] = [
    ["Franchisee Name", franchiseeName(f)],
    ["Franchisee Code", txt(f.franchisee_code)],
    ["Franchise Type", txt(f.franchise_type)],
    ["Location", location],
    ["Territory", territory],
    ["Agreement Date", formatDMY(f.agreement_date as string)],
    ["Agreement Expiry", formatDMY(f.agreement_expiry as string)],
  ];

  const commercials: DocBlock = {
    kind: "table",
    head: ["Particular", "Value"],
    widths: [6, 4],
    rightAlignFrom: 1,
    rows: [
      ["Franchise Fee", `Rs. ${money(f.franchise_fee)}`],
      ["Franchise Commission", `Rs. ${money(f.franchise_commission_amount)}`],
      ["MG %", pct(f.mg_percent)],
      ["TNS %", pct(f.tns_percent)],
      ["Academy %", pct(f.academy_percent)],
      ["Mall of Salon %", pct(f.mall_percent)],
      ["Royalty %", pct(f.royalty_percent)],
    ],
  };

  let title = "";
  let body: DocBlock[] = [];
  let fileLabel = "";

  if (docType === "franchise_confirmation") {
    title = "FRANCHISE CONFIRMATION LETTER";
    fileLabel = "Franchise Confirmation Letter";
    body = [
      {
        kind: "paragraph",
        text: `This is to confirm that ${franchiseeName(f)} has been appointed as an authorized franchise partner of ${COMPANY_NAME} for the territory stated below, on the applicable commercial terms recorded against the franchise agreement.`,
      },
      { kind: "heading", text: "FRANCHISE DETAILS" },
      { kind: "table", head: ["Particulars", "Details"], widths: [4, 6], rows: core },
      { kind: "heading", text: "APPLICABLE COMMERCIAL TERMS" },
      commercials,
    ];
  } else if (docType === "franchise_onboarding") {
    title = "FRANCHISE ONBOARDING LETTER";
    fileLabel = "Franchise Onboarding Letter";
    body = [
      {
        kind: "paragraph",
        text: `Welcome to the ${COMPANY_NAME} franchise network. This letter records the onboarding of ${franchiseeName(f)} and the immediate onboarding requirements.`,
      },
      { kind: "heading", text: "FRANCHISE DETAILS" },
      {
        kind: "table",
        head: ["Particulars", "Details"],
        widths: [4, 6],
        rows: [
          ...core,
          ["Onboarding Date", extras.onboardingDate?.trim() ? formatDMY(extras.onboardingDate) : formatDMY(f.joined_at as string)],
          ["Assigned Manager / Team", managerName],
        ],
      },
      { kind: "heading", text: "ONBOARDING REQUIREMENTS" },
      {
        kind: "bullets",
        items: [
          "Submission of KYC documents (Aadhaar, PAN, GST certificate where applicable)",
          "Signed franchise agreement and payment of the applicable franchise fee",
          "Bank details for ROI and payout settlement",
          "Premises readiness verification and branding installation",
          "Team onboarding and product/POS training",
        ],
      },
      { kind: "heading", text: "APPLICABLE COMMERCIAL TERMS" },
      commercials,
    ];
  } else if (docType === "franchise_renewal") {
    title = "FRANCHISE RENEWAL LETTER";
    fileLabel = "Franchise Renewal Letter";
    requireFields({ "New Agreement Date": extras.newAgreementDate, "New Expiry Date": extras.newExpiryDate });
    body = [
      {
        kind: "paragraph",
        text: `This letter confirms the renewal of the franchise agreement held by ${franchiseeName(f)} with ${COMPANY_NAME}.`,
      },
      { kind: "heading", text: "RENEWAL DETAILS" },
      {
        kind: "table",
        head: ["Particulars", "Details"],
        widths: [4, 6],
        rows: [
          ["Franchisee Name", franchiseeName(f)],
          ["Franchisee Code", txt(f.franchisee_code)],
          ["Existing Agreement", txt(f.agreement_number ?? f.agreement_version)],
          ["Old Agreement Date", formatDMY(f.agreement_date as string)],
          ["Old Expiry Date", formatDMY(f.agreement_expiry as string)],
          ["New Agreement Date", formatDMY(extras.newAgreementDate)],
          ["New Expiry Date", formatDMY(extras.newExpiryDate)],
        ],
      },
      { kind: "heading", text: "UPDATED COMMERCIAL TERMS" },
      commercials,
    ];
  } else {
    title = "FRANCHISE TERMINATION LETTER";
    fileLabel = "Franchise Termination Letter";
    requireFields({ "Termination Date": extras.terminationDate, Reason: extras.reason });
    body = [
      {
        kind: "paragraph",
        text: `This letter serves as formal notice of termination of the franchise arrangement between ${COMPANY_NAME} and ${franchiseeName(f)}.`,
      },
      { kind: "heading", text: "TERMINATION DETAILS" },
      {
        kind: "table",
        head: ["Particulars", "Details"],
        widths: [4, 6],
        rows: [
          ["Franchisee Name", franchiseeName(f)],
          ["Franchisee Code", txt(f.franchisee_code)],
          ["Agreement", txt(f.agreement_number ?? f.agreement_version)],
          ["Agreement Date", formatDMY(f.agreement_date as string)],
          ["Termination Date", formatDMY(extras.terminationDate)],
          ["Reason", txt(extras.reason)],
          ["Outstanding Amount", `Rs. ${money(extras.outstandingAmount)}`],
          ["Settlement Amount", `Rs. ${money(extras.settlementAmount)}`],
        ],
      },
      { kind: "heading", text: "APPLICABLE TERMINATION TERMS" },
      {
        kind: "bullets",
        items: [
          "All use of the brand name, logo, branding and marketing material must cease with immediate effect from the termination date.",
          "All outstanding dues must be settled as per the amounts stated above.",
          "Company property, stock and branding assets must be returned or settled as per the agreement.",
          "Confidentiality obligations under the agreement continue after termination.",
        ],
      },
    ];
  }

  const model: DocModel = {
    docType,
    docNumber,
    title,
    fileBase: safeFileName(`${fileLabel} - ${franchiseeName(f)} - ${docNumber}`),
    meta: [
      ["Reference No.:", docNumber],
      ["Date:", formatDMY(new Date())],
      ["Franchisee Name:", franchiseeName(f)],
      ["Franchisee Code:", txt(f.franchisee_code)],
    ],
    blocks: [
      ...body,
      { kind: "signature", caption: `Authorized Signatory, ${COMPANY_NAME}`, seal: true, line: false },
    ],
  };
  return { model, links: { franchisee_id: franchiseeId }, sourceKey: null };
}

/* 12. OTHER OFFICIAL LETTER --------------------------------------------- */

async function officialLetter(docNumber: string, extras: Extras) {
  requireFields({ To: extras.to, Subject: extras.subject, Body: extras.body });
  const blocks: DocBlock[] = [
    { kind: "paragraph", text: "To," },
    { kind: "paragraph", text: txt(extras.to), bold: true },
    { kind: "paragraph", text: `Subject: ${txt(extras.subject)}`, bold: true },
    ...extras
      .body!.split(/\n{1,}/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t): DocBlock => ({ kind: "paragraph", text: t })),
  ];
  if (extras.attachments?.trim()) {
    blocks.push({ kind: "heading", text: "ATTACHMENTS" });
    blocks.push({
      kind: "bullets",
      items: extras.attachments
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  blocks.push({ kind: "signature", caption: `Authorized Signatory, ${COMPANY_NAME}`, seal: true, line: false });

  const model: DocModel = {
    docType: "official_letter",
    docNumber,
    title: (extras.title?.trim() || "OFFICIAL BUSINESS LETTER").toUpperCase(),
    fileBase: safeFileName(`Official Letter - ${extras.subject} - ${docNumber}`),
    meta: [
      ["Reference No.:", docNumber],
      ["Date:", formatDMY(new Date())],
      ["To:", txt(extras.to)],
      ["Subject:", txt(extras.subject)],
    ],
    blocks,
  };
  return { model, links: {}, sourceKey: null };
}
