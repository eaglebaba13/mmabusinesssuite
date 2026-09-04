// Invoice source documents live in the PRIVATE `invoice-sources` bucket.
// We persist the storage path and open files only through short-lived signed
// URLs, so financial attachments are never fetchable without authorization.
// Legacy rows may hold a full public URL — the path is extracted from it.
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "invoice-sources";

export function invoiceSourcePath(stored: string) {
  const marker = `/${BUCKET}/`;
  const i = stored.indexOf(marker);
  return i >= 0 ? stored.slice(i + marker.length) : stored;
}

export async function openInvoiceSourceDoc(stored: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(invoiceSourcePath(stored), 300);
  if (error) {
    toast.error(error.message);
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}
