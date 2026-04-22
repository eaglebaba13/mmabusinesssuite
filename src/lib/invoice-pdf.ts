import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Party = {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
};

type InvoiceItem = {
  product_name: string;
  sku?: string | null;
  hsn_code?: string | null;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  gst_pct: number;
  line_subtotal: number;
  line_gst: number;
  line_total: number;
};

type InvoicePayment = {
  method: string;
  amount: number;
  reference?: string | null;
  paid_at: string;
};

export type InvoicePdfInput = {
  invoiceNumber: string;
  invoiceDate: string; // ISO
  status: string;
  paymentStatus: string;
  seller: Party;
  buyer: Party;
  items: InvoiceItem[];
  totals: {
    subtotal: number;
    discount: number;
    cgst: number;
    sgst: number;
    igst: number;
    grandTotal: number;
    amountPaid: number;
  };
  payments?: InvoicePayment[];
  notes?: string | null;
};

// GSTIN format: 2-digit state code + 10-char PAN + 1 entity + "Z" + 1 check
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGSTIN(g?: string | null): boolean {
  if (!g) return false;
  return GSTIN_REGEX.test(g.trim().toUpperCase());
}

export function gstinStateCode(g?: string | null): string | null {
  if (!isValidGSTIN(g)) return null;
  return g!.trim().substring(0, 2);
}

// Indian state code → state name (for cross-checking party.state vs GSTIN)
const STATE_CODE_TO_NAME: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
  "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
  "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

export function stateNameFromGSTIN(g?: string | null): string | null {
  const code = gstinStateCode(g);
  return code ? (STATE_CODE_TO_NAME[code] ?? null) : null;
}

export type InvoiceValidation = {
  buyerGstinMissing: boolean;
  buyerGstinInvalid: boolean;
  sellerGstinMissing: boolean;
  sellerGstinInvalid: boolean;
  buyerStateMissing: boolean;
  sellerStateMissing: boolean;
  stateMismatch: boolean; // GSTIN state code ≠ party.state
  isInterState: boolean;
  taxModeMismatch: boolean; // intra-state but IGST charged, or inter-state but CGST/SGST charged
  missingHsnRows: number[]; // 1-indexed item rows missing HSN
};

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

// Indian numbering system: amount in words
function numberToWordsIN(num: number): string {
  const n = Math.floor(Math.abs(num));
  const paise = Math.round((Math.abs(num) - n) * 100);
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const twoDigits = (x: number): string => {
    if (x < 20) return a[x];
    return b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : "");
  };
  const threeDigits = (x: number): string => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    return (h ? a[h] + " Hundred" + (r ? " " : "") : "") + (r ? twoDigits(r) : "");
  };
  if (n === 0) return paise ? `Zero Rupees and ${twoDigits(paise)} Paise Only` : "Zero Rupees Only";
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  let words = "";
  if (crore) words += threeDigits(crore) + " Crore ";
  if (lakh) words += twoDigits(lakh) + " Lakh ";
  if (thousand) words += twoDigits(thousand) + " Thousand ";
  if (rest) words += threeDigits(rest);
  words = words.trim().replace(/\s+/g, " ");
  return paise
    ? `${words} Rupees and ${twoDigits(paise)} Paise Only`
    : `${words} Rupees Only`;
}

export function downloadGstInvoicePdf(inv: InvoicePdfInput) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  let y = margin;

  // ── Header band ────────────────────────────────────────────────────────────
  doc.setFillColor(13, 13, 13);
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setTextColor(201, 168, 76);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("TAX INVOICE", margin, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 220);
  doc.text("Original for Recipient", margin, 56);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(inv.seller.name, pageWidth - margin, 38, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(220, 220, 220);
  const sellerAddr = [
    inv.seller.address,
    [inv.seller.city, inv.seller.state].filter(Boolean).join(", "),
    inv.seller.gstin ? `GSTIN: ${inv.seller.gstin}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (sellerAddr) doc.text(sellerAddr, pageWidth - margin, 54, { align: "right" });

  y = 90;

  // ── Invoice meta ───────────────────────────────────────────────────────────
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Invoice No: ${inv.invoiceNumber}`, margin, y);
  const dt = new Date(inv.invoiceDate).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  doc.text(`Date: ${dt}`, pageWidth - margin, y, { align: "right" });
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Status: ${inv.status}   ·   Payment: ${inv.paymentStatus}`, margin, y);
  y += 14;

  // ── Bill to / Ship from blocks ─────────────────────────────────────────────
  const colW = (pageWidth - margin * 2 - 12) / 2;
  const blockTop = y;
  const blockH = 88;

  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(248, 246, 240);
  doc.rect(margin, blockTop, colW, blockH, "FD");
  doc.rect(margin + colW + 12, blockTop, colW, blockH, "FD");

  const writeParty = (title: string, p: Party, x: number) => {
    let py = blockTop + 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(120, 100, 40);
    doc.text(title, x + 10, py);
    py += 14;
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(p.name || "—", x + 10, py);
    py += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    if (p.address) {
      doc.text(doc.splitTextToSize(p.address, colW - 20), x + 10, py);
      py += 10;
    }
    const cityState = [p.city, p.state].filter(Boolean).join(", ");
    if (cityState) {
      doc.text(cityState, x + 10, py);
      py += 10;
    }
    if (p.phone) {
      doc.text(`Phone: ${p.phone}`, x + 10, py);
      py += 10;
    }
    if (p.email) {
      doc.text(`Email: ${p.email}`, x + 10, py);
      py += 10;
    }
    if (p.gstin) {
      doc.setFont("helvetica", "bold");
      doc.text(`GSTIN: ${p.gstin}`, x + 10, py);
    }
  };

  writeParty("BILLED FROM", inv.seller, margin);
  writeParty("BILLED TO", inv.buyer, margin + colW + 12);
  y = blockTop + blockH + 14;

  // ── Items table ────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [["#", "Item", "HSN", "Qty", "Rate", "Disc%", "Taxable", "GST%", "CGST", "SGST", "Total"]],
    body: inv.items.map((it, i) => {
      const halfGst = it.line_gst / 2;
      return [
        String(i + 1),
        it.product_name + (it.sku ? `\n${it.sku}` : ""),
        it.hsn_code ?? "—",
        String(it.quantity),
        fmtINR(it.unit_price),
        `${it.discount_pct}%`,
        fmtINR(it.line_subtotal),
        `${it.gst_pct}%`,
        fmtINR(halfGst),
        fmtINR(halfGst),
        fmtINR(it.line_total),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 5, textColor: [40, 40, 40], lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [13, 13, 13], textColor: [201, 168, 76], fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "center", cellWidth: 22 },
      1: { cellWidth: 130 },
      2: { halign: "center", cellWidth: 38 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right" },
      5: { halign: "right", cellWidth: 36 },
      6: { halign: "right" },
      7: { halign: "right", cellWidth: 34 },
      8: { halign: "right" },
      9: { halign: "right" },
      10: { halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [250, 248, 244] },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 14;

  // ── Totals box (right-aligned) ─────────────────────────────────────────────
  const totalsW = 240;
  const totalsX = pageWidth - margin - totalsW;
  const lines: [string, string][] = [
    ["Subtotal", fmtINR(inv.totals.subtotal)],
  ];
  if (inv.totals.discount > 0) lines.push(["Discount", `- ${fmtINR(inv.totals.discount)}`]);
  if (inv.totals.cgst > 0) lines.push(["CGST", fmtINR(inv.totals.cgst)]);
  if (inv.totals.sgst > 0) lines.push(["SGST", fmtINR(inv.totals.sgst)]);
  if (inv.totals.igst > 0) lines.push(["IGST", fmtINR(inv.totals.igst)]);

  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(252, 250, 246);
  const totalsH = 18 * lines.length + 38;
  doc.rect(totalsX, y, totalsW, totalsH, "FD");

  let ty = y + 18;
  doc.setFontSize(10);
  lines.forEach(([label, val]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(label, totalsX + 12, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(val, totalsX + totalsW - 12, ty, { align: "right" });
    ty += 16;
  });
  // Grand total band
  doc.setFillColor(13, 13, 13);
  doc.rect(totalsX, ty - 4, totalsW, 26, "F");
  doc.setTextColor(201, 168, 76);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Grand Total", totalsX + 12, ty + 14);
  doc.text(fmtINR(inv.totals.grandTotal), totalsX + totalsW - 12, ty + 14, { align: "right" });

  y += totalsH + 14;

  // ── Amount in words ────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("Amount in words:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  const words = numberToWordsIN(inv.totals.grandTotal);
  doc.text(doc.splitTextToSize(words, pageWidth - margin * 2 - 110), margin + 100, y);
  y += 22;

  // ── Payments ───────────────────────────────────────────────────────────────
  if (inv.payments && inv.payments.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text("Payments received", margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Method", "Reference", "Date", "Amount"]],
      body: inv.payments.map((p) => [
        p.method.replace(/_/g, " "),
        p.reference ?? "—",
        new Date(p.paid_at).toLocaleString("en-IN"),
        fmtINR(p.amount),
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [240, 235, 220], textColor: [60, 50, 20], fontStyle: "bold" },
      columnStyles: { 3: { halign: "right", fontStyle: "bold" } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  // ── Notes & footer ─────────────────────────────────────────────────────────
  if (inv.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text("Notes:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(doc.splitTextToSize(inv.notes, pageWidth - margin * 2 - 50), margin + 40, y);
    y += 24;
  }

  // Declaration & signature
  const footerY = doc.internal.pageSize.getHeight() - 90;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(
    "Declaration: We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.",
    margin,
    footerY + 14,
    { maxWidth: pageWidth - margin * 2 - 160 },
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(`For ${inv.seller.name}`, pageWidth - margin, footerY + 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text("Authorised Signatory", pageWidth - margin, footerY + 60, { align: "right" });

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "This is a computer-generated tax invoice and does not require a physical signature.",
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 18,
    { align: "center" },
  );

  doc.save(`invoice-${inv.invoiceNumber}.pdf`);
}
