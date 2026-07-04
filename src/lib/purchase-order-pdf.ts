import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  preloadLetterhead,
  requirePreloaded,
  drawPortraitLetterheadSync,
  PORTRAIT_CONTENT_TOP,
  PORTRAIT_CONTENT_BOTTOM,
  A4_HEIGHT,
} from "./letterhead";

type Party = {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
};

export type PurchaseOrderItem = {
  product_name: string;
  sku?: string | null;
  hsn_code?: string | null;
  quantity: number;
  unit_price: number;
  discount_pct?: number;
  gst_pct?: number;
  line_total: number;
};

export type PurchaseOrderPdfInput = {
  poNumber: string;
  poDate: string; // ISO
  status?: string;
  expectedDeliveryDate?: string | null;
  buyer: Party; // your company (issuer)
  supplier: Party; // vendor
  shipTo?: Party | null;
  items: PurchaseOrderItem[];
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    shipping?: number;
    grandTotal: number;
  };
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  notes?: string | null;
  preparedBy?: string | null;
};

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

function numberToWordsIN(num: number): string {
  const n = Math.floor(Math.abs(num));
  const paise = Math.round((Math.abs(num) - n) * 100);
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number): string => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : ""));
  const three = (x: number): string => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    return (h ? a[h] + " Hundred" + (r ? " " : "") : "") + (r ? two(r) : "");
  };
  if (n === 0) return paise ? `Zero Rupees and ${two(paise)} Paise Only` : "Zero Rupees Only";
  const cr = Math.floor(n / 10000000);
  const lk = Math.floor((n % 10000000) / 100000);
  const th = Math.floor((n % 100000) / 1000);
  const rs = n % 1000;
  let w = "";
  if (cr) w += three(cr) + " Crore ";
  if (lk) w += two(lk) + " Lakh ";
  if (th) w += two(th) + " Thousand ";
  if (rs) w += three(rs);
  w = w.trim().replace(/\s+/g, " ");
  return paise ? `${w} Rupees and ${two(paise)} Paise Only` : `${w} Rupees Only`;
}

function writeParty(
  doc: jsPDF,
  title: string,
  p: Party,
  x: number,
  yTop: number,
  colW: number,
) {
  let py = yTop + 16;
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
    const lines = doc.splitTextToSize(p.address, colW - 20);
    doc.text(lines, x + 10, py);
    py += 10 * lines.length;
  }
  const cityState = [p.city, p.state].filter(Boolean).join(", ");
  if (cityState) { doc.text(cityState, x + 10, py); py += 10; }
  if (p.phone) { doc.text(`Phone: ${p.phone}`, x + 10, py); py += 10; }
  if (p.email) { doc.text(`Email: ${p.email}`, x + 10, py); py += 10; }
  if (p.gstin) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.text(`GSTIN: ${p.gstin}`, x + 10, py);
  }
}

export async function downloadPurchaseOrderPdf(po: PurchaseOrderPdfInput) {
  await preloadLetterhead();
  const preloaded = await requirePreloaded();

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  drawPortraitLetterheadSync(doc, preloaded.full);
  let y = PORTRAIT_CONTENT_TOP;

  // Title
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PURCHASE ORDER", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Vendor Copy", margin, y + 12);
  y += 26;

  // Meta
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`PO No: ${po.poNumber}`, margin, y);
  const dt = new Date(po.poDate).toLocaleString("en-IN", { dateStyle: "medium" });
  doc.text(`Date: ${dt}`, pageWidth - margin, y, { align: "right" });
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const metaParts: string[] = [];
  if (po.status) metaParts.push(`Status: ${po.status}`);
  if (po.expectedDeliveryDate)
    metaParts.push(`Expected Delivery: ${new Date(po.expectedDeliveryDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}`);
  if (metaParts.length) {
    doc.text(metaParts.join("   ·   "), margin, y);
    y += 14;
  }

  // Party blocks: Supplier + Ship To (or Buyer)
  const colW = (pageWidth - margin * 2 - 12) / 2;
  const blockTop = y;
  const blockH = 106;

  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(248, 246, 240);
  doc.rect(margin, blockTop, colW, blockH, "FD");
  doc.rect(margin + colW + 12, blockTop, colW, blockH, "FD");

  writeParty(doc, "VENDOR / SUPPLIER", po.supplier, margin, blockTop, colW);
  const rightParty = po.shipTo ?? po.buyer;
  writeParty(doc, po.shipTo ? "SHIP TO" : "BILL TO", rightParty, margin + colW + 12, blockTop, colW);

  y = blockTop + blockH + 14;

  // Items table
  autoTable(doc, {
    startY: y,
    head: [["#", "Item", "HSN", "Qty", "Rate", "Disc%", "GST%", "Total"]],
    body: po.items.map((it, i) => [
      String(i + 1),
      it.product_name + (it.sku ? `\n${it.sku}` : ""),
      it.hsn_code || "—",
      String(it.quantity),
      fmtINR(it.unit_price),
      it.discount_pct != null ? `${it.discount_pct}%` : "—",
      it.gst_pct != null ? `${it.gst_pct}%` : "—",
      fmtINR(it.line_total),
    ]),
    styles: { fontSize: 8, cellPadding: 5, textColor: [40, 40, 40], lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [13, 13, 13], textColor: [201, 168, 76], fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "center", cellWidth: 24 },
      1: { cellWidth: 180 },
      2: { halign: "center", cellWidth: 46 },
      3: { halign: "right", cellWidth: 34 },
      4: { halign: "right" },
      5: { halign: "right", cellWidth: 42 },
      6: { halign: "right", cellWidth: 38 },
      7: { halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [250, 248, 244] },
    margin: {
      left: margin,
      right: margin,
      top: PORTRAIT_CONTENT_TOP,
      bottom: A4_HEIGHT - PORTRAIT_CONTENT_BOTTOM + 10,
    },
    didDrawPage: () => drawPortraitLetterheadSync(doc, preloaded.full),
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // Totals
  const totalsW = 240;
  const totalsX = pageWidth - margin - totalsW;
  const lines: [string, string][] = [["Subtotal", fmtINR(po.totals.subtotal)]];
  if (po.totals.discount > 0) lines.push(["Discount", `- ${fmtINR(po.totals.discount)}`]);
  if (po.totals.tax > 0) lines.push(["Tax (GST)", fmtINR(po.totals.tax)]);
  if (po.totals.shipping && po.totals.shipping > 0) lines.push(["Shipping", fmtINR(po.totals.shipping)]);

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
  doc.setFillColor(13, 13, 13);
  doc.rect(totalsX, ty - 4, totalsW, 26, "F");
  doc.setTextColor(201, 168, 76);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Grand Total", totalsX + 12, ty + 14);
  doc.text(fmtINR(po.totals.grandTotal), totalsX + totalsW - 12, ty + 14, { align: "right" });

  y += totalsH + 14;

  // Amount in words
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("Amount in words:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  const words = numberToWordsIN(po.totals.grandTotal);
  doc.text(doc.splitTextToSize(words, pageWidth - margin * 2 - 110), margin + 100, y);
  y += 22;

  // Terms
  const terms: [string, string][] = [];
  if (po.paymentTerms) terms.push(["Payment Terms", po.paymentTerms]);
  if (po.deliveryTerms) terms.push(["Delivery Terms", po.deliveryTerms]);
  if (po.notes) terms.push(["Notes", po.notes]);

  for (const [label, val] of terms) {
    if (y > PORTRAIT_CONTENT_BOTTOM - 40) {
      doc.addPage();
      drawPortraitLetterheadSync(doc, preloaded.full);
      y = PORTRAIT_CONTENT_TOP;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    const wrapped = doc.splitTextToSize(val, pageWidth - margin * 2 - 110);
    doc.text(wrapped, margin + 100, y);
    y += 12 * wrapped.length + 6;
  }

  // Signatory (bottom of safe zone)
  const sigY = Math.min(PORTRAIT_CONTENT_BOTTOM - 30, Math.max(y + 20, PORTRAIT_CONTENT_BOTTOM - 60));
  doc.setDrawColor(180, 180, 180);
  doc.line(pageWidth - margin - 180, sigY, pageWidth - margin, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text("Authorised Signatory", pageWidth - margin, sigY + 12, { align: "right" });
  if (po.preparedBy) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Prepared by: ${po.preparedBy}`, margin, sigY + 12);
  }

  doc.save(`PO-${po.poNumber}.pdf`);
}
