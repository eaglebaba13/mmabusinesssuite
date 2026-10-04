import { storageService } from "@/lib/storage";
// Generation / regeneration, secure storage and version history for official
// documents. All access is RLS-gated; files live in the private
// `official-documents` bucket and are only ever served via short-lived
// signed URLs.
import { supabase } from "@/integrations/supabase/client";
import { renderDocDocx, renderDocPdf } from "./render";
import { buildModel, type Extras } from "./builders";
import { docTypeDef, type DocModel, type DocTypeKey } from "./model";

const BUCKET = "official-documents";

export type OfficialDocRow = {
  id: string;
  doc_type: string;
  doc_number: string;
  title: string;
  version: number;
  status: string;
  franchisee_id: string | null;
  employee_id: string | null;
  agreement_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  payout_id: string | null;
  purchase_order_id: string | null;
  source_key: string | null;
  payload: unknown;
  pdf_path: string | null;
  docx_path: string | null;
  created_at: string;
  updated_at: string;
};

export async function listDocuments(filter?: { docType?: DocTypeKey | "all" }) {
  let q = supabase.from("official_documents").select("*").order("created_at", { ascending: false }).limit(300);
  if (filter?.docType && filter.docType !== "all") q = q.eq("doc_type", filter.docType);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as OfficialDocRow[];
}

export async function findExisting(docType: DocTypeKey, sourceKey: string | null) {
  if (!sourceKey) return null;
  const { data, error } = await supabase
    .from("official_documents")
    .select("*")
    .eq("doc_type", docType)
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as OfficialDocRow | null) ?? null;
}

async function reserveNumber(prefix: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_document_number", { _prefix: prefix });
  if (error) throw error;
  if (!data) throw new Error("Could not reserve a document number.");
  return data as string;
}

async function upload(path: string, blob: Blob, contentType: string) {
  const { error } = await storageService.from(BUCKET).upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
}

/**
 * Generates (or regenerates) an official document. Regeneration keeps the
 * existing document number and bumps the version.
 */
export async function generateDocument(opts: {
  docType: DocTypeKey;
  sourceId: string | null;
  extras?: Extras;
  regenerate?: boolean;
  reason?: string;
}): Promise<{ row: OfficialDocRow; model: DocModel }> {
  const def = docTypeDef(opts.docType);

  // Probe the model once with a placeholder number so validation errors surface
  // before a document number is consumed.
  const probe = await buildModel({ docType: opts.docType, sourceId: opts.sourceId, docNumber: "PENDING", extras: opts.extras });
  const existing = await findExisting(opts.docType, probe.sourceKey);
  if (existing && !opts.regenerate) {
    const rebuilt = await buildModel({
      docType: opts.docType,
      sourceId: opts.sourceId,
      docNumber: existing.doc_number,
      extras: opts.extras,
    });
    return { row: existing, model: rebuilt.model };
  }

  const docNumber = existing?.doc_number ?? (await reserveNumber(def.prefix));
  const { model, links, sourceKey } = await buildModel({
    docType: opts.docType,
    sourceId: opts.sourceId,
    docNumber,
    extras: opts.extras,
  });

  const [pdf, docx] = await Promise.all([
    renderDocPdf(model, { sealAllowed: def.seal }),
    renderDocDocx(model, { sealAllowed: def.seal }),
  ]);

  const prefixPath = `${def.folder}/${docNumber}`;
  const pdfPath = `${prefixPath}/${model.fileBase}.pdf`;
  const docxPath = `${prefixPath}/${model.fileBase}.docx`;
  await upload(pdfPath, pdf, "application/pdf");
  await upload(docxPath, docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  const { data: { user } = { user: null } } = await supabase.auth.getUser();
  const version = existing ? existing.version + 1 : 1;

  const record = {
    doc_type: opts.docType,
    doc_number: docNumber,
    title: model.title,
    version,
    status: "generated",
    source_key: sourceKey,
    payload: { ...(model as unknown as Record<string, unknown>), extras: opts.extras ?? {} },
    pdf_path: pdfPath,
    docx_path: docxPath,
    franchisee_id: links.franchisee_id ?? null,
    employee_id: links.employee_id ?? null,
    agreement_id: links.agreement_id ?? null,
    invoice_id: links.invoice_id ?? null,
    payment_id: links.payment_id ?? null,
    payout_id: links.payout_id ?? null,
    purchase_order_id: links.purchase_order_id ?? null,
    updated_by: user?.id ?? null,
  };

  let row: OfficialDocRow;
  if (existing) {
    const { data, error } = await supabase
      .from("official_documents")
      .update(record)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    row = data as unknown as OfficialDocRow;
  } else {
    const { data, error } = await supabase
      .from("official_documents")
      .insert({ ...record, created_by: user?.id ?? null })
      .select("*")
      .single();
    if (error) throw error;
    row = data as unknown as OfficialDocRow;
  }

  await supabase.from("official_document_versions").insert([
    {
      document_id: row.id,
      version,
      action: existing ? "regenerated" : "generated",
      reason: opts.reason ?? null,
      payload: JSON.parse(JSON.stringify(model)),
      pdf_path: pdfPath,
      docx_path: docxPath,
      actor: user?.id ?? null,
    },
  ]);

  return { row, model };
}

export async function documentVersions(documentId: string) {
  const { data, error } = await supabase
    .from("official_document_versions")
    .select("id, version, action, reason, created_at, pdf_path, docx_path")
    .eq("document_id", documentId)
    .order("version", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function signedDocUrl(path: string, download?: string) {
  const { data, error } = await storageService
    .from(BUCKET)
    .createSignedUrl(path, 60 * 5, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

/** Download as a blob object URL so the PDF embeds reliably in an iframe. */
export async function docObjectUrl(path: string) {
  const { data, error } = await storageService.from(BUCKET).download(path);
  if (error) throw error;
  return URL.createObjectURL(new Blob([await data.arrayBuffer()], { type: "application/pdf" }));
}

export async function downloadDoc(path: string, filename: string) {
  const url = await signedDocUrl(path, filename);
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function updateDocStatus(id: string, status: string) {
  const { error } = await supabase.from("official_documents").update({ status }).eq("id", id);
  if (error) throw error;
}
