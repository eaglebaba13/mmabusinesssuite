import * as React from "react";
import { Download, FileText, Loader2, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { docObjectUrl, downloadDoc, type OfficialDocRow } from "@/lib/docgen/service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: OfficialDocRow | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
};

export function DocumentPreviewDialog({ open, onOpenChange, doc, onRegenerate, regenerating }: Props) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!open || !doc?.pdf_path) return;
    let cancelled = false;
    let created: string | null = null;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        created = await docObjectUrl(doc.pdf_path!);
        if (!cancelled) setUrl(created);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [open, doc?.pdf_path, doc?.version, attempt]);

  const fileBase = React.useMemo(() => {
    const p = doc?.pdf_path ?? "";
    const name = p.split("/").pop() ?? "document.pdf";
    return name.replace(/\.pdf$/i, "");
  }, [doc?.pdf_path]);

  const grab = async (kind: "pdf" | "docx") => {
    const path = kind === "pdf" ? doc?.pdf_path : doc?.docx_path;
    if (!path) return;
    try {
      await downloadDoc(path, `${fileBase}.${kind}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> {doc?.title ?? "Document"} — {doc?.doc_number}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-3 pt-1">
            <Badge variant="outline">v{doc?.version ?? 1}</Badge>
            <Badge variant="secondary">{doc?.status ?? "generated"}</Badge>
            <span className="text-xs">
              Generated {doc ? new Date(doc.updated_at).toLocaleString("en-IN") : ""}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/30 border-y border-border/40 h-[68vh] flex items-center justify-center">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading document…
            </div>
          ) : error ? (
            <div className="max-w-md text-center space-y-3 p-6">
              <p className="text-sm font-medium">Preview failed to load</p>
              <p className="text-xs text-muted-foreground break-words">{error}</p>
              <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry preview
              </Button>
            </div>
          ) : url ? (
            <iframe src={`${url}#toolbar=0&navpanes=0`} title="Document preview" className="h-full w-full" />
          ) : (
            <p className="text-sm text-muted-foreground">No document file available.</p>
          )}
        </div>

        <DialogFooter className="p-4 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onRegenerate && (
            <Button variant="outline" size="sm" onClick={onRegenerate} disabled={regenerating}>
              {regenerating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Regenerate
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!url}
            onClick={() => {
              if (url) window.open(url, "_blank", "noopener")?.print?.();
            }}
          >
            <Printer className="mr-1 h-3.5 w-3.5" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => grab("docx")} disabled={!doc?.docx_path}>
            <Download className="mr-1 h-3.5 w-3.5" /> DOCX
          </Button>
          <Button size="sm" className="bg-gradient-gold text-background" onClick={() => grab("pdf")} disabled={!doc?.pdf_path}>
            <Download className="mr-1 h-3.5 w-3.5" /> Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
