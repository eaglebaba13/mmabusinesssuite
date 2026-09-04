// Renders a DocModel onto the master MMA letterhead (PDF) and into an
// editable DOCX. The letterhead image is stamped unmodified as the page
// background; content only ever occupies the safe zone between the header
// and footer artwork.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  loadDocAssets,
  CONTENT_TOP,
  CONTENT_BOTTOM,
  CONTENT_LEFT,
  type ImageEntry,
} from "./assets";
import {
  COMPANY_GSTIN,
  COMPANY_NAME,
  assertNoPlaceholders,
  type DocBlock,
  type DocModel,
} from "./model";

const GOLD: [number, number, number] = [201, 168, 76];
const INK: [number, number, number] = [35, 35, 35];

export async function renderDocPdf(model: DocModel, opts?: { sealAllowed?: boolean }): Promise<Blob> {
  assertNoPlaceholders(model);
  const { letterhead, seal } = await loadDocAssets();

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = CONTENT_LEFT;
  const right = pageW - CONTENT_LEFT;
  const contentW = right - left;

  const stamp = () => {
    doc.addImage(letterhead.dataUrl, "JPEG", 0, 0, pageW, pageH, undefined, "FAST");
  };
  stamp();
  let y = CONTENT_TOP;

  const ensure = (need: number) => {
    if (y + need <= CONTENT_BOTTOM) return;
    doc.addPage();
    stamp();
    y = CONTENT_TOP;
  };

  // Title + document number
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(model.title, pageW / 2, y, { align: "center" });
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Document No.: ${model.docNumber}`, pageW / 2, y, { align: "center" });
  y += 20;

  const kvRows = (rows: [string, string][], labelW = 160) => {
    doc.setFontSize(9.5);
    rows.forEach(([k, v]) => {
      const value = String(v ?? "");
      const lines = doc.splitTextToSize(value, contentW - labelW - 8) as string[];
      ensure(lines.length * 12 + 4);
      doc.setTextColor(...INK);
      doc.setFont("helvetica", "bold");
      doc.text(k, left, y);
      doc.setFont("helvetica", "normal");
      doc.text(lines, left + labelW, y);
      y += Math.max(14, lines.length * 12 + 2);
    });
  };

  if (model.meta.length) {
    kvRows([["Company Name:", COMPANY_NAME], ...model.meta]);
    y += 8;
  }

  const tableOpts = {
    theme: "grid" as const,
    styles: {
      fontSize: 9.5,
      cellPadding: 5,
      textColor: [40, 40, 40] as [number, number, number],
      lineColor: [190, 190, 190] as [number, number, number],
    },
    headStyles: { fillColor: GOLD, textColor: [20, 20, 20] as [number, number, number], fontStyle: "bold" as const },
    margin: { left, right: CONTENT_LEFT, top: CONTENT_TOP, bottom: pageH - CONTENT_BOTTOM + 10 },
    rowPageBreak: "avoid" as const,
    didDrawPage: stamp,
  };

  const drawBlock = (b: DocBlock) => {
    switch (b.kind) {
      case "heading":
        ensure(34);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...INK);
        doc.text(b.text, left, y);
        y += 16;
        break;
      case "paragraph": {
        doc.setFont("helvetica", b.bold ? "bold" : "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...INK);
        const lines = doc.splitTextToSize(b.text, contentW) as string[];
        ensure(lines.length * 12 + 6);
        doc.text(lines, left, y);
        y += lines.length * 12 + 8;
        break;
      }
      case "kv":
        kvRows(b.rows);
        y += 4;
        break;
      case "bullets":
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...INK);
        b.items.forEach((item) => {
          const lines = doc.splitTextToSize(item, contentW - 18) as string[];
          ensure(lines.length * 12 + 2);
          doc.text("•", left + 4, y);
          doc.text(lines, left + 18, y);
          y += lines.length * 12 + 3;
        });
        y += 6;
        break;
      case "table": {
        const total = (b.widths ?? []).reduce((a, c) => a + c, 0);
        const columnStyles: Record<number, { cellWidth?: number; halign?: "right"; fontStyle?: "bold" }> = {};
        if (b.widths && total > 0) {
          b.widths.forEach((w, i) => {
            columnStyles[i] = { cellWidth: (w / total) * contentW };
          });
        }
        if (b.rightAlignFrom != null) {
          for (let i = b.rightAlignFrom; i < b.head.length; i++) {
            columnStyles[i] = { ...(columnStyles[i] ?? {}), halign: "right" };
          }
        }
        ensure(60);
        autoTable(doc, {
          ...tableOpts,
          startY: y,
          head: [b.head],
          body: b.rows,
          columnStyles,
          didParseCell: (d) => {
            if (b.boldLastRow && d.section === "body" && d.row.index === b.rows.length - 1) {
              d.cell.styles.fontStyle = "bold";
            }
          },
        });
        y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 18;
        break;
      }
      case "spacer":
        y += b.h ?? 14;
        break;
      case "pagebreak":
        doc.addPage();
        stamp();
        y = CONTENT_TOP;
        break;
      case "signature": {
        const withSeal = Boolean(b.seal && opts?.sealAllowed);
        ensure(withSeal ? 110 : 70);
        y += 10;
        if (withSeal) {
          const w = 150;
          const h = (seal.height / seal.width) * w;
          doc.addImage(seal.dataUrl, "PNG", left, y, w, h, undefined, "FAST");
          y += h + 4;
        } else if (b.line !== false) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor(...INK);
          y += 26;
          doc.text("________________________________________", left, y);
          y += 14;
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...INK);
        doc.text(b.caption, left, y);
        y += 14;
        if (b.name) {
          doc.setFont("helvetica", "bold");
          doc.text(b.name, left, y);
          y += 14;
        }
        if (b.subline) {
          doc.setFont("helvetica", "normal");
          doc.text(b.subline, left, y);
          y += 14;
        }
        break;
      }
    }
  };

  model.blocks.forEach(drawBlock);

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`GSTIN - ${COMPANY_GSTIN}`, left, CONTENT_BOTTOM + 14);
    doc.text(`${model.docNumber}  •  Page ${i} of ${total}`, right, CONTENT_BOTTOM + 14, { align: "right" });
  }

  return doc.output("blob");
}

/* --------------------------------- DOCX --------------------------------- */

async function sealBytes(seal: ImageEntry): Promise<Uint8Array> {
  const res = await fetch(seal.dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}

export async function renderDocDocx(model: DocModel, opts?: { sealAllowed?: boolean }): Promise<Blob> {
  assertNoPlaceholders(model);
  const { letterhead, seal } = await loadDocAssets();
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    AlignmentType,
    WidthType,
    ShadingType,
    BorderStyle,
    PageBreak,
    ImageRun,
    Header,
    Footer,
    PageNumber,
  } = await import("docx");

  const CONTENT_DXA = 9026;
  const border = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 80, bottom: 80, left: 120, right: 120 };

  const run = (text: string, o?: { bold?: boolean; size?: number; color?: string }) =>
    new TextRun({ text, bold: o?.bold, font: "Arial", size: o?.size ?? 20, color: o?.color });

  const cell = (text: string, width: number, o?: { bold?: boolean; fill?: string; right?: boolean }) =>
    new TableCell({
      borders,
      margins,
      width: { size: width, type: WidthType.DXA },
      shading: o?.fill ? { fill: o.fill, type: ShadingType.CLEAR } : undefined,
      children: String(text)
        .split("\n")
        .map(
          (line) =>
            new Paragraph({
              alignment: o?.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [run(line, { bold: o?.bold })],
            }),
        ),
    });

  const kv = (label: string, value: string) =>
    new Paragraph({ spacing: { after: 60 }, children: [run(`${label} `, { bold: true }), run(value)] });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [run(model.title, { bold: true, size: 30 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [run(`Document No.: ${model.docNumber}`, { size: 18, color: "666666" })],
    }),
    kv("Company Name:", COMPANY_NAME),
    ...model.meta.map(([k, v]) => kv(k, v)),
  ];

  const sealImage = opts?.sealAllowed ? await sealBytes(seal) : null;

  for (const b of model.blocks) {
    switch (b.kind) {
      case "heading":
        children.push(new Paragraph({ spacing: { before: 260, after: 140 }, children: [run(b.text, { bold: true, size: 22 })] }));
        break;
      case "paragraph":
        children.push(new Paragraph({ spacing: { after: 140 }, children: [run(b.text, { bold: b.bold })] }));
        break;
      case "kv":
        b.rows.forEach(([k, v]) => children.push(kv(k, v)));
        break;
      case "bullets":
        b.items.forEach((i) =>
          children.push(new Paragraph({ spacing: { after: 60 }, indent: { left: 480 }, children: [run(`•  ${i}`)] })),
        );
        break;
      case "table": {
        const weights = b.widths ?? b.head.map(() => 1);
        const sum = weights.reduce((a, c) => a + c, 0);
        const widths = weights.map((w) => Math.round((w / sum) * CONTENT_DXA));
        widths[widths.length - 1] = CONTENT_DXA - widths.slice(0, -1).reduce((a, c) => a + c, 0);
        children.push(
          new Table({
            width: { size: CONTENT_DXA, type: WidthType.DXA },
            columnWidths: widths,
            rows: [
              new TableRow({
                children: b.head.map((h, i) => cell(h, widths[i], { bold: true, fill: "EFE6C9" })),
              }),
              ...b.rows.map(
                (r, ri) =>
                  new TableRow({
                    children: r.map((c, i) =>
                      cell(c, widths[i], {
                        bold: Boolean(b.boldLastRow && ri === b.rows.length - 1),
                        right: b.rightAlignFrom != null && i >= b.rightAlignFrom,
                      }),
                    ),
                  }),
              ),
            ],
          }),
        );
        children.push(new Paragraph({ spacing: { after: 120 }, children: [run("")] }));
        break;
      }
      case "spacer":
        children.push(new Paragraph({ children: [run("")] }));
        break;
      case "pagebreak":
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case "signature": {
        children.push(new Paragraph({ spacing: { before: 240 }, children: [run("")] }));
        if (b.seal && sealImage) {
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  type: "png",
                  data: sealImage,
                  transformation: { width: 170, height: Math.round((seal.height / seal.width) * 170) },
                  altText: { title: "Company seal and signature", description: "Authorized company seal and signature", name: "seal" },
                }),
              ],
            }),
          );
        } else if (b.line !== false) {
          children.push(new Paragraph({ spacing: { before: 240 }, children: [run("________________________________________")] }));
        }
        children.push(new Paragraph({ children: [run(b.caption)] }));
        if (b.name) children.push(new Paragraph({ children: [run(b.name, { bold: true })] }));
        if (b.subline) children.push(new Paragraph({ children: [run(b.subline)] }));
        break;
      }
    }
  }

  const headerBytes = await (async () => {
    const res = await fetch(letterhead.dataUrl);
    return new Uint8Array(await res.arrayBuffer());
  })();

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1980, right: 1440, bottom: 1700, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    type: "jpg",
                    data: headerBytes,
                    transformation: { width: 595, height: 842 },
                    floating: {
                      horizontalPosition: { offset: 0 },
                      verticalPosition: { offset: 0 },
                      behindDocument: true,
                      zIndex: 0,
                    },
                    altText: { title: "MMA letterhead", description: "Official MMA letterhead", name: "letterhead" },
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  run(`${model.docNumber}  •  Page `, { size: 16, color: "888888" }),
                  new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "888888" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
