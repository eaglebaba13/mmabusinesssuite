// ROI Claim Letter — data mapping + PDF/DOCX generation.
// Master template: "FRANCHISEE ROI CLAIM" (ONE STOP - MALL OF SALON PVT. LTD.).
// Terminology must stay exactly as in the master template.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  preloadLetterhead,
  requirePreloaded,
  drawPortraitLetterheadSync,
  PORTRAIT_CONTENT_TOP,
  PORTRAIT_CONTENT_BOTTOM,
} from "./letterhead";

export const CLAIM_COMPANY_NAME = "ONE STOP - MALL OF SALON PVT. LTD.";
export const CLAIM_COMPANY_GSTIN = "08AAECO2759F1ZC";

export const CLAIM_ACTIVITY_TYPES = [
  "Marketing & Promotions",
  "Offline Promotions / Events",
  "Dealer Meet / Influencer Program",
  "POP / Branding / Display Materials",
  "Training / Workshop Expenses",
];

export const DEFAULT_CLAIM_DESCRIPTION =
  "Digital Marketing Management, Meta Ads (Facebook & Instagram), WhatsApp marketing, CRM-based lead nurturing, Landing page conversion optimization";

export const NA = "Not Available";

export type ClaimStatus = "draft" | "generated" | "submitted" | "approved" | "rejected" | "paid";

export type FranchiseeForClaim = {
  id: string;
  full_name: string | null;
  auth_name?: string | null;
  franchisee_code?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  territory_city?: string | null;
  territory_district?: string | null;
  territory_state?: string | null;
  territory_area?: string | null;
  bank_name?: string | null;
  bank_account_holder?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_branch?: string | null;
  investment_amount?: number | null;
  mg_percent?: number | null;
};

export type PayoutForClaim = {
  id: string;
  franchisee_id: string;
  payout_month: string;
  base_roi?: number | null;
  mg_amount?: number | null;
  academy_incentive?: number | null;
  dark_store_incentive?: number | null;
  emporium_incentive?: number | null;
  variable_roi?: number | null;
  total_amount?: number | null;
  final_payable?: number | null;
  payable_reason?: string | null;
};

export type ClaimData = {
  companyName: string;
  gstin: string;
  cityFranchiseeName: string;
  authName: string;
  franchiseeCode: string;
  claimPeriod: string; // "July 2026"
  claimPeriodDate: string; // ISO date (month start)
  submissionDate: string; // DD/MM/YYYY
  claimRefNo: string;
  address: string;
  email: string;
  location: string;
  territory: string;
  activityType: string;
  description: string;
  fixRoi: number;
  shopifyClaim: number;
  tnsClaim: number;
  netPayable: number;
  totalClaimed: number;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  calculationBasis: string;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const t = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : NA);
const clean = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : null);

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh",
];

/**
 * Best-effort derivation of city / state from a free-text franchisee address.
 * Only extracts text that is actually present in the record — nothing is invented.
 */
export function deriveFromAddress(address?: string | null): { city: string | null; state: string | null } {
  const a = clean(address);
  if (!a) return { city: null, state: null };
  const state = INDIAN_STATES.find((s) => new RegExp(`\\b${s}\\b`, "i").test(a)) ?? null;
  let city: string | null = null;
  const parts = a
    .split(/[,\n]/)
    .map((s) => s.replace(/\b\d{6}\b/g, "").replace(/[–-]\s*$/, "").trim())
    .filter(Boolean);
  if (state) {
    const idx = parts.findIndex((s) => new RegExp(`\\b${state}\\b`, "i").test(s));
    if (idx > 0) city = parts[idx - 1] || null;
  }
  if (!city && parts.length >= 2) city = parts[parts.length - 2] || null;
  return { city, state };
}

export type ClaimActivity = { activityType: string; description: string };

export function formatClaimPeriod(monthIso: string): string {
  return new Date(monthIso).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export function formatDMY(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

export const claimAmount = (v: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n(v)));

/** Map DB records into the master template fields. Approved payout amount is never recalculated. */
export function buildClaimData(opts: {
  franchisee: FranchiseeForClaim;
  payout: PayoutForClaim;
  claimRefNo: number | string;
  submittedOn?: string | Date;
  activityType?: string | null;
  description?: string | null;
  activities?: ClaimActivity[] | null;
  /** Resolved from related records (territory / warehouse / state franchise) when the franchisee row is blank. */
  locationFallback?: string | null;
  territoryFallback?: string | null;
}): ClaimData {
  const { franchisee: f, payout: p } = opts;
  const fixRoi = n(p.base_roi ?? p.mg_amount);
  const shopifyClaim = n(p.academy_incentive) + n(p.dark_store_incentive);
  const tnsClaim = n(p.emporium_incentive);
  const approved = n(p.total_amount ?? p.final_payable);

  const derived = deriveFromAddress(f.address);
  const cityLike =
    clean(f.territory_city) || clean(f.territory_district) || clean(opts.locationFallback) || derived.city;
  const stateLike = clean(f.territory_state) || derived.state;
  const location = [cityLike, stateLike].filter(Boolean).join(", ") || NA;
  const territory =
    clean(f.territory_area) ||
    clean(opts.territoryFallback) ||
    cityLike ||
    stateLike ||
    NA;

  const activityType = opts.activityType?.trim() || CLAIM_ACTIVITY_TYPES[0];
  const description = opts.description?.trim() || DEFAULT_CLAIM_DESCRIPTION;
  const activities =
    opts.activities?.filter((a) => a.activityType?.trim() || a.description?.trim()).map((a) => ({
      activityType: a.activityType?.trim() || activityType,
      description: a.description?.trim() || description,
    })) ?? [];

  return {
    companyName: CLAIM_COMPANY_NAME,
    gstin: CLAIM_COMPANY_GSTIN,
    cityFranchiseeName: t(f.full_name),
    authName: t(f.auth_name || f.full_name),
    franchiseeCode: t(f.franchisee_code),
    claimPeriod: formatClaimPeriod(p.payout_month),
    claimPeriodDate: p.payout_month,
    submissionDate: formatDMY(opts.submittedOn ?? new Date()),
    claimRefNo: String(opts.claimRefNo),
    address: t(f.address),
    email: t(f.email),
    location,
    territory,
    activityType,
    description,
    activities: activities.length ? activities : [{ activityType, description }],
    fixRoi,
    shopifyClaim,
    tnsClaim,
    netPayable: approved,
    totalClaimed: approved,
    calculationBasis:
      p.payable_reason ||
      (n(p.variable_roi) >= n(p.mg_amount) ? "Variable ROI exceeded MG" : "Minimum Guarantee Applied"),
    bankName: t(f.bank_name),
    accountHolder: t(f.bank_account_holder || f.full_name),
    accountNumber: t(f.bank_account_number),
    ifsc: t(f.bank_ifsc),
    branch: t(f.bank_branch),
  };
}

/**
 * Content-completeness gate: every mandatory field of the master template must
 * carry a real value (or the explicit "Not Available" marker) before we render
 * an official claim. Throws listing the missing fields.
 */
export function assertClaimComplete(data: ClaimData): void {
  const bad = (v: unknown) =>
    v === null ||
    v === undefined ||
    (typeof v === "number" && !Number.isFinite(v)) ||
    (typeof v === "string" && (!v.trim() || /\{\{|undefined|null|NaN/.test(v)));

  const required: Record<string, unknown> = {
    "Company Name": data.companyName,
    "City Franchisee Name": data.cityFranchiseeName,
    "Franchisee Auth. Name": data.authName,
    "Franchisee Code": data.franchiseeCode,
    "Claim Period": data.claimPeriod,
    "Date of Submission": data.submissionDate,
    "Claim Reference No.": data.claimRefNo,
    "Franchisee Address": data.address,
    "Email ID": data.email,
    Location: data.location,
    Territory: data.territory,
    "Activity Type": data.activities[0]?.activityType,
    Description: data.activities[0]?.description,
    "Total Claimed Amount": data.totalClaimed,
    "Fix 3% ROI Claimed": data.fixRoi,
    "Shopify Claim / Approved": data.shopifyClaim,
    "TNS Turnover Claim": data.tnsClaim,
    "NET PAYABLE AMOUNT": data.netPayable,
    "Bank Name": data.bankName,
    "Account Holder Name": data.accountHolder,
    "Account Number": data.accountNumber,
    "IFSC Code": data.ifsc,
    Branch: data.branch,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => bad(v))
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`ROI Claim is incomplete — missing field(s): ${missing.join(", ")}.`);
  }
}


/** Returns a list of human-readable problems; empty list means safe to generate. */
export function validateClaim(f: FranchiseeForClaim | null | undefined, p: PayoutForClaim | null | undefined): string[] {
  const errors: string[] = [];
  if (!f) return ["ROI Claim cannot be generated because the franchisee record was not found."];
  if (!p) return ["ROI Claim cannot be generated because the ROI payout record was not found."];
  if (!f.full_name?.trim()) errors.push("Franchisee name is missing on the franchisee record.");
  if (!p.payout_month) errors.push("Claim period (payout month) is missing on the ROI payout.");
  if (n(p.total_amount ?? p.final_payable) <= 0)
    errors.push("Approved ROI amount is zero — nothing to claim for this period.");
  if (!f.bank_name?.trim() || !f.bank_account_number?.trim() || !f.bank_ifsc?.trim())
    errors.push("ROI Claim cannot be generated because verified bank details are missing for this franchisee.");
  return errors;
}

export function claimFileBase(data: ClaimData): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  return `ROI Claim - ${safe(data.cityFranchiseeName)} - ${safe(data.claimPeriod)} - ${data.claimRefNo}`;
}

export function claimStoragePrefix(franchiseeId: string, claimRefNo: number | string) {
  return `${franchiseeId}/${claimRefNo}`;
}

/* ---------------------------------- PDF ---------------------------------- */

export async function generateClaimPdf(data: ClaimData): Promise<Blob> {
  await preloadLetterhead();
  const { full } = await requirePreloaded();

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const left = 56;
  const right = pageW - 56;
  const contentW = right - left;

  const newPage = (first = false) => {
    if (!first) doc.addPage();
    drawPortraitLetterheadSync(doc, full);
  };
  newPage(true);

  let y = PORTRAIT_CONTENT_TOP;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(25, 25, 25);
  doc.text("FRANCHISEE ROI CLAIM", pageW / 2, y, { align: "center" });
  y += 22;

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  const headRows: [string, string][] = [
    ["Company Name:", data.companyName],
    ["City Franchisee Name:", data.cityFranchiseeName],
    ["Franchisee Auth. Name:", data.authName],
    ["Franchisee Code:", data.franchiseeCode],
    ["Claim Period:", data.claimPeriod],
    ["Date of Submission:", data.submissionDate],
    ["Claim Reference No.:", data.claimRefNo],
  ];
  headRows.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(k, left, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), left + 150, y, { maxWidth: contentW - 150 });
    y += 15;
  });
  y += 6;

  const section = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(25, 25, 25);
    doc.text(title, left, y);
    y += 8;
  };

  const tableOpts = {
    theme: "grid" as const,
    styles: { fontSize: 9.5, cellPadding: 6, textColor: [40, 40, 40] as [number, number, number], lineColor: [190, 190, 190] as [number, number, number] },
    headStyles: { fillColor: [201, 168, 76] as [number, number, number], textColor: [20, 20, 20] as [number, number, number], fontStyle: "bold" as const },
    margin: { left, right: 56, top: PORTRAIT_CONTENT_TOP, bottom: doc.internal.pageSize.getHeight() - PORTRAIT_CONTENT_BOTTOM + 10 },
    rowPageBreak: "avoid" as const,
    didDrawPage: () => drawPortraitLetterheadSync(doc, full),
  };
  const afterTable = () => {
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 22;
  };

  section("1.  DEALER DETAILS:");
  autoTable(doc, {
    ...tableOpts,
    startY: y,
    head: [["Particulars", "Details"]],
    body: [
      ["City Franchisee Name", data.cityFranchiseeName],
      ["Franchisee Auth. Name", data.authName],
      ["Franchisee Code", data.franchiseeCode],
      ["Franchisee Address", data.address],
      ["Email ID", data.email],
      ["Location", data.location],
      ["Territory", data.territory],
    ],
    columnStyles: { 0: { cellWidth: 170, fontStyle: "bold" } },
  });
  afterTable();

  section("2.  ACTIVITY / EXPENSE DETAILS:");
  autoTable(doc, {
    ...tableOpts,
    startY: y,
    head: [["Sr. No.", "Activity Type / Description"]],
    body: [["1.", `${data.activityType}\n${data.description}`]],
    columnStyles: { 0: { cellWidth: 55 } },
  });
  afterTable();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Total Claimed Amount (Rs.): ${claimAmount(data.totalClaimed)}`, left, y);
  y += 24;

  section("3.  ACTIVITY TYPES:");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  CLAIM_ACTIVITY_TYPES.slice(1).forEach((a) => {
    doc.text(`•  ${a}`, left + 12, y + 8);
    y += 15;
  });
  y += 20;

  // Section 4 onwards on page 2 (keeps tables from breaking awkwardly)
  newPage();
  y = PORTRAIT_CONTENT_TOP;

  section("4.  SUMMARY OF CLAIM:");
  autoTable(doc, {
    ...tableOpts,
    startY: y,
    head: [["Particular", "Amount (Rs.)"]],
    body: [
      ["Fix 3% ROI Claimed", claimAmount(data.fixRoi)],
      ["Shopify Claim / Approved", claimAmount(data.shopifyClaim)],
      ["TNS Turnover Claim", claimAmount(data.tnsClaim)],
      ["NET PAYABLE AMOUNT (Rs.)", claimAmount(data.netPayable)],
    ],
    columnStyles: { 0: { cellWidth: 300 }, 1: { halign: "right" } },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === 3) d.cell.styles.fontStyle = "bold";
    },
  });
  afterTable();

  section("5.  BANK DETAILS (for Reimbursement)");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  (
    [
      ["Bank Name:", data.bankName],
      ["Account Holder Name:", data.accountHolder],
      ["Account Number:", data.accountNumber],
      ["IFSC Code:", data.ifsc],
      ["Branch:", data.branch],
    ] as [string, string][]
  ).forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.text(k, left + 12, y + 8);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), left + 170, y + 8);
    y += 16;
  });
  y += 18;

  section("6.  DEALER DECLARATION");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(
    "I hereby declare that the information and expenses submitted above are true and supported with valid documents (bills/invoices/photos/reports).",
    left,
    y + 8,
    { maxWidth: contentW },
  );
  y += 48;
  doc.text("________________________________________", left, y);
  y += 15;
  doc.text("Authorized Signatory with seal & stamp", left, y);
  y += 15;
  doc.setFont("helvetica", "bold");
  doc.text(data.authName, left, y);
  y += 15;
  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${data.submissionDate}`, left, y);

  // Page numbering
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Page ${i} of ${total}`, right, PORTRAIT_CONTENT_BOTTOM + 14, { align: "right" });
  }

  return doc.output("blob");
}

/* --------------------------------- DOCX --------------------------------- */

export async function generateClaimDocx(data: ClaimData): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    AlignmentType,
    HeadingLevel,
    WidthType,
    ShadingType,
    BorderStyle,
    PageBreak,
  } = await import("docx");

  const border = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 80, bottom: 80, left: 120, right: 120 };

  const cell = (text: string, width: number, opts?: { bold?: boolean; fill?: string; right?: boolean }) =>
    new TableCell({
      borders,
      margins,
      width: { size: width, type: WidthType.DXA },
      shading: opts?.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
      children: [
        new Paragraph({
          alignment: opts?.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text, bold: opts?.bold, font: "Arial", size: 20 })],
        }),
      ],
    });

  const kv = (label: string, value: string) =>
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: `${label} `, bold: true, font: "Arial", size: 20 }),
        new TextRun({ text: value, font: "Arial", size: 20 }),
      ],
    });

  const heading = (text: string) =>
    new Paragraph({
      spacing: { before: 260, after: 140 },
      children: [new TextRun({ text, bold: true, font: "Arial", size: 22 })],
    });

  const twoColTable = (rows: [string, string][], head: [string, string], rightAlign = false) =>
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3600, 5760],
      rows: [
        new TableRow({
          children: [cell(head[0], 3600, { bold: true, fill: "EFE6C9" }), cell(head[1], 5760, { bold: true, fill: "EFE6C9" })],
        }),
        ...rows.map(
          ([k, v]) =>
            new TableRow({
              children: [cell(k, 3600, { bold: true }), cell(v, 5760, { right: rightAlign })],
            }),
        ),
      ],
    });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1273, bottom: 1440, left: 1273 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `GSTIN - ${data.gstin}`, font: "Arial", size: 18, color: "666666" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 160, after: 240 },
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "FRANCHISEE ROI CLAIM", bold: true, font: "Arial", size: 30 })],
          }),
          kv("Company Name:", data.companyName),
          kv("City Franchisee Name:", data.cityFranchiseeName),
          kv("Franchisee Auth. Name:", data.authName),
          kv("Franchisee Code:", data.franchiseeCode),
          kv("Claim Period:", data.claimPeriod),
          kv("Date of Submission:", data.submissionDate),
          kv("Claim Reference No.:", data.claimRefNo),

          heading("1.  DEALER DETAILS:"),
          twoColTable(
            [
              ["City Franchisee Name", data.cityFranchiseeName],
              ["Franchisee Auth. Name", data.authName],
              ["Franchisee Code", data.franchiseeCode],
              ["Franchisee Address", data.address],
              ["Email ID", data.email],
              ["Location", data.location],
              ["Territory", data.territory],
            ],
            ["Particulars", "Details"],
          ),

          heading("2.  ACTIVITY / EXPENSE DETAILS:"),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [1200, 8160],
            rows: [
              new TableRow({
                children: [cell("Sr. No.", 1200, { bold: true, fill: "EFE6C9" }), cell("Activity Type / Description", 8160, { bold: true, fill: "EFE6C9" })],
              }),
              new TableRow({
                children: [cell("1.", 1200), cell(`${data.activityType}\n${data.description}`, 8160)],
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 200 },
            children: [
              new TextRun({ text: `Total Claimed Amount (₹): ${claimAmount(data.totalClaimed)}`, bold: true, font: "Arial", size: 20 }),
            ],
          }),

          heading("3.  ACTIVITY TYPES:"),
          ...CLAIM_ACTIVITY_TYPES.slice(1).map(
            (a) =>
              new Paragraph({
                spacing: { after: 60 },
                indent: { left: 480 },
                children: [new TextRun({ text: `•  ${a}`, font: "Arial", size: 20 })],
              }),
          ),

          new Paragraph({ children: [new PageBreak()] }),

          heading("4.  SUMMARY OF CLAIM:"),
          twoColTable(
            [
              ["Fix 3% ROI Claimed", claimAmount(data.fixRoi)],
              ["Shopify Claim / Approved", claimAmount(data.shopifyClaim)],
              ["TNS Turnover Claim", claimAmount(data.tnsClaim)],
              ["NET PAYABLE AMOUNT (₹)", claimAmount(data.netPayable)],
            ],
            ["Particular", "Amount (₹)"],
            true,
          ),

          heading("5.  BANK DETAILS (for Reimbursement)"),
          kv("Bank Name:", data.bankName),
          kv("Account Holder Name:", data.accountHolder),
          kv("Account Number:", data.accountNumber),
          kv("IFSC Code:", data.ifsc),
          kv("Branch:", data.branch),

          heading("6.  DEALER DECLARATION"),
          new Paragraph({
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: "I hereby declare that the information and expenses submitted above are true and supported with valid documents (bills/invoices/photos/reports).",
                font: "Arial",
                size: 20,
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: "________________________________________", font: "Arial", size: 20 })] }),
          new Paragraph({ children: [new TextRun({ text: "Authorized Signatory with seal & stamp", font: "Arial", size: 20 })] }),
          new Paragraph({ children: [new TextRun({ text: data.authName, bold: true, font: "Arial", size: 20 })] }),
          new Paragraph({ children: [new TextRun({ text: `Date: ${data.submissionDate}`, font: "Arial", size: 20 })] }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}
