// Document model shared by the PDF and DOCX renderers, plus the registry of
// official document types. Content only — no data access, no styling decisions.

export const COMPANY_NAME = "ONE STOP - MALL OF SALON PVT. LTD.";
export const COMPANY_BRAND = "MakeMeArtist";
export const COMPANY_GSTIN = "08AAECO2759F1ZC";
export const NA = "Not Available";

export type DocBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string; bold?: boolean }
  | { kind: "kv"; rows: [string, string][] }
  | {
      kind: "table";
      head: string[];
      rows: string[][];
      widths?: number[]; // relative weights
      boldLastRow?: boolean;
      rightAlignFrom?: number;
    }
  | { kind: "bullets"; items: string[] }
  | { kind: "spacer"; h?: number }
  | { kind: "pagebreak" }
  | {
      kind: "signature";
      caption: string; // e.g. "Authorized Signatory with seal & stamp"
      name?: string;
      subline?: string;
      /** Stamp the official company seal/signature (only when the workflow authorizes it). */
      seal?: boolean;
      /** Render a blank signature line (for counterparty signatures). */
      line?: boolean;
    };

export type DocModel = {
  docType: DocTypeKey;
  docNumber: string;
  title: string;
  fileBase: string;
  meta: [string, string][];
  blocks: DocBlock[];
};

export type DocTypeKey =
  | "roi_claim"
  | "franchise_agreement"
  | "invoice"
  | "payment_receipt"
  | "payout_statement"
  | "purchase_order"
  | "offer_letter"
  | "franchise_confirmation"
  | "franchise_onboarding"
  | "franchise_renewal"
  | "franchise_termination"
  | "official_letter";

export type SourceKind =
  | "roi_payout"
  | "agreement"
  | "invoice"
  | "payment"
  | "purchase_order"
  | "employee"
  | "franchisee"
  | "none";

export type DocTypeDef = {
  key: DocTypeKey;
  label: string;
  prefix: string; // document numbering prefix
  source: SourceKind;
  /** Whether the official company seal/signature is authorized on this document. */
  seal: boolean;
  folder: string; // storage folder
  /** Roles allowed to generate this type ("admin" = super_admin/founder). */
  allow: ("admin" | "accounts" | "hr")[];
};

export const DOC_TYPES: DocTypeDef[] = [
  { key: "roi_claim", label: "Franchise ROI Claim", prefix: "ROI", source: "roi_payout", seal: false, folder: "roi-claims", allow: ["admin", "accounts"] },
  { key: "franchise_agreement", label: "Franchise Agreement", prefix: "AGR", source: "agreement", seal: true, folder: "agreements", allow: ["admin"] },
  { key: "invoice", label: "Invoice", prefix: "INV", source: "invoice", seal: false, folder: "invoices", allow: ["admin", "accounts"] },
  { key: "payment_receipt", label: "Payment Receipt", prefix: "REC", source: "payment", seal: true, folder: "receipts", allow: ["admin", "accounts"] },
  { key: "payout_statement", label: "Payout Statement", prefix: "PAY", source: "roi_payout", seal: true, folder: "payouts", allow: ["admin", "accounts"] },
  { key: "purchase_order", label: "Purchase Order", prefix: "PO", source: "purchase_order", seal: true, folder: "purchase-orders", allow: ["admin", "accounts"] },
  { key: "offer_letter", label: "Offer Letter", prefix: "OL", source: "employee", seal: true, folder: "offer-letters", allow: ["admin", "hr"] },
  { key: "franchise_confirmation", label: "Franchise Confirmation Letter", prefix: "FCL", source: "franchisee", seal: true, folder: "official-letters", allow: ["admin"] },
  { key: "franchise_onboarding", label: "Franchise Onboarding Letter", prefix: "FOL", source: "franchisee", seal: true, folder: "official-letters", allow: ["admin"] },
  { key: "franchise_renewal", label: "Franchise Renewal Letter", prefix: "FRL", source: "franchisee", seal: true, folder: "official-letters", allow: ["admin"] },
  { key: "franchise_termination", label: "Franchise Termination Letter", prefix: "FTL", source: "franchisee", seal: true, folder: "official-letters", allow: ["admin"] },
  { key: "official_letter", label: "Other Official Business Letter", prefix: "LTR", source: "none", seal: true, folder: "official-letters", allow: ["admin", "accounts", "hr"] },
];

export const docTypeDef = (key: DocTypeKey) => {
  const def = DOC_TYPES.find((d) => d.key === key);
  if (!def) throw new Error(`Unknown document type: ${key}`);
  return def;
};

/* ------------------------------ formatting ------------------------------ */

export const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const txt = (v: unknown) => (v != null && String(v).trim() ? String(v).trim() : NA);

export const money = (v: unknown) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(v));

export const moneyR = (v: unknown) => `Rs. ${money(v)}`;

export function formatDMY(d: Date | string | null | undefined): string {
  if (!d) return NA;
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return NA;
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

export function formatMonthYear(d: string | null | undefined): string {
  if (!d) return NA;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return NA;
  return dt.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}

/** Indian numbering system amount in words, e.g. "Rupees One Lakh Twenty Only". */
export function amountInWords(value: unknown): string {
  const total = Math.round(num(value) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  if (rupees === 0 && paise === 0) return "Rupees Zero Only";

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundreds = rupees % 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundreds) parts.push(threeDigits(hundreds));

  const rupeeWords = parts.filter(Boolean).join(" ") || "Zero";
  const paiseWords = paise ? ` and ${twoDigits(paise)} Paise` : "";
  return `Rupees ${rupeeWords}${paiseWords} Only`;
}

/** Placeholder / bad-value gate. Official documents must never ship these. */
export function assertNoPlaceholders(model: DocModel) {
  const bad = /\{\{|\bundefined\b|\bNaN\b|\bnull\b/;
  const walk = (s: string, where: string) => {
    if (bad.test(s)) throw new Error(`Document contains an unresolved placeholder in ${where}: "${s}"`);
  };
  model.meta.forEach(([k, v]) => walk(`${k} ${v}`, "the header"));
  model.blocks.forEach((b) => {
    if (b.kind === "paragraph" || b.kind === "heading") walk(b.text, "the body");
    if (b.kind === "kv") b.rows.forEach(([k, v]) => walk(`${k} ${v}`, "a details block"));
    if (b.kind === "table") {
      b.head.forEach((h) => walk(h, "a table header"));
      b.rows.forEach((r) => r.forEach((c) => walk(c, "a table row")));
    }
    if (b.kind === "bullets") b.items.forEach((i) => walk(i, "a list"));
  });
}

/** Mandatory-field gate with the exact wording the business asked for. */
export function requireFields(fields: Record<string, unknown>) {
  const missing = Object.entries(fields)
    .filter(([, v]) => v == null || (typeof v === "string" && !v.trim()) || (typeof v === "number" && !Number.isFinite(v)))
    .map(([k]) => k);
  if (missing.length) throw new Error(`Required information missing: ${missing.join(", ")}`);
}

export function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}
