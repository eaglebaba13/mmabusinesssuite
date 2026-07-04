import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  buildGstInvoicePdf,
  type InvoicePdfInput,
} from "@/lib/invoice-pdf";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoicePdfInput | null;
};

/**
 * Renders the exact export-quality invoice PDF inside an <iframe> so the user
 * can verify letterhead alignment and safe-zone spacing before downloading.
 */
export function InvoicePreviewDialog({ open, onOpenChange, invoice }: Props) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const docRef = React.useRef<Awaited<ReturnType<typeof buildGstInvoicePdf>> | null>(null);

  React.useEffect(() => {
    if (!open || !invoice) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    (async () => {
      try {
        const doc = await buildGstInvoicePdf(invoice);
        if (cancelled) return;
        docRef.current = doc;
        const blob = doc.output("blob");
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      } catch (e) {
        console.error("[InvoicePreview] build failed", e);
        toast.error("Could not render invoice preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setUrl(null);
      docRef.current = null;
    };
  }, [open, invoice]);

  const handleDownload = () => {
    const doc = docRef.current;
    if (!doc || !invoice) return;
    doc.save(`invoice-${invoice.invoiceNumber}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>Invoice preview</DialogTitle>
          <DialogDescription>
            Verify letterhead alignment and safe-zone spacing before exporting.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/30 border-y border-border/40 h-[70vh] flex items-center justify-center">
          {loading || !url ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Rendering PDF…
            </div>
          ) : (
            <iframe
              src={`${url}#toolbar=0&navpanes=0`}
              title="Invoice preview"
              className="h-full w-full"
            />
          )}
        </div>

        <DialogFooter className="p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleDownload}
            disabled={loading || !url}
            className="bg-gradient-gold text-background"
          >
            <Download className="mr-1 h-4 w-4" /> Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
