import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  preloadLetterhead,
  requirePreloaded,
  drawLandscapeLetterheadSync,
  LANDSCAPE_CONTENT_TOP,
  LANDSCAPE_CONTENT_BOTTOM,
} from "./letterhead";

export type ExportColumn<T> = {
  header: string;
  accessor: (row: T) => string | number;
};

function escapeCsv(val: string | number) {
  const s = String(val ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToCSV<T>(filename: string, rows: T[], columns: ExportColumn<T>[]) {
  const header = columns.map((c) => escapeCsv(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escapeCsv(c.accessor(r))).join(",")).join("\n");
  const csv = `${header}\n${body}`;
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

export async function exportToPDF<T>(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  rows: T[];
  columns: ExportColumn<T>[];
  totals?: { label: string; value: string }[];
}) {
  await preloadLetterhead();
  const { header, footer } = await requirePreloaded();

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawLandscapeLetterheadSync(doc, header, footer);

  // Title sits inside safe zone (below letterhead header strip)
  const titleY = LANDSCAPE_CONTENT_TOP;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 30, 30);
  doc.text(opts.title, 40, titleY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const generated = `Generated ${new Date().toLocaleString("en-IN")}`;
  doc.text(opts.subtitle ? `${opts.subtitle}  ·  ${generated}` : generated, 40, titleY + 14);

  const pageH = doc.internal.pageSize.getHeight();
  autoTable(doc, {
    startY: titleY + 30,
    head: [opts.columns.map((c) => c.header)],
    body: opts.rows.map((r) => opts.columns.map((c) => String(c.accessor(r) ?? ""))),
    styles: { fontSize: 9, cellPadding: 6, textColor: [40, 40, 40] },
    headStyles: { fillColor: [201, 168, 76], textColor: [20, 20, 20], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 246, 240] },
    margin: { left: 40, right: 40, top: LANDSCAPE_CONTENT_TOP, bottom: pageH - LANDSCAPE_CONTENT_BOTTOM + 10 },
    didDrawPage: () => drawLandscapeLetterheadSync(doc, header, footer),
  });

  if (opts.totals?.length) {
    const finalY = (doc as any).lastAutoTable?.finalY ?? 100;
    let y = finalY + 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    opts.totals.forEach((t) => {
      doc.text(`${t.label}: ${t.value}`, 40, y);
      y += 16;
    });
  }

  doc.save(`${opts.filename}.pdf`);
}

export function inDateRange(dateStr: string | null | undefined, from: string, to: string) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function defaultDateRange() {
  const to = new Date().toISOString().slice(0, 10);
  const fromD = new Date();
  fromD.setMonth(fromD.getMonth() - 1);
  const from = fromD.toISOString().slice(0, 10);
  return { from, to };
}
