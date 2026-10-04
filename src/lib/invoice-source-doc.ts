import { storageService } from "@/lib/storage";
// Invoice source documents live in the PRIVATE `invoice-sources` bucket.
// We persist the storage path and open files only through short-lived signed
// URLs, so financial attachments are never fetchable without authorization.
// Legacy rows may hold a full public URL — the path is extracted from it.
import { toast } from "sonner";
import { legacyStoragePath } from "./storage-policy";

const BUCKET = "invoice-sources";

export function invoiceSourcePath(stored: string) {
  return legacyStoragePath(stored, BUCKET) ?? stored;
}

export async function openInvoiceSourceDoc(stored: string) {
  const { data, error } = await storageService
    .from(BUCKET)
    .createSignedUrl(invoiceSourcePath(stored), 300);
  if (error) {
    toast.error(error.message);
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}
