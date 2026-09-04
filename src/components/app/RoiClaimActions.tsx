import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Download, Printer, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import {
  downloadClaimFile,
  fetchClaimForPayout,
  generateClaimForPayout,
  claimObjectUrl,
  updateClaimStatus,
  type RoiClaimRow,
} from "@/lib/roi-claim-service";
import { claimFileBase, formatClaimPeriod, type ClaimData } from "@/lib/roi-claim";

const CLAIM_STATUSES = ["draft", "generated", "submitted", "approved", "rejected", "paid"] as const;

const statusClass = (s: string) =>
  s === "approved" || s === "paid"
    ? "border-emerald-500/40 text-emerald-500"
    : s === "rejected"
      ? "border-red-500/40 text-red-500"
      : s === "submitted"
        ? "border-sky-500/40 text-sky-500"
        : "border-amber-500/40 text-amber-500";

export function RoiClaimStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={statusClass(status)}>
      {status}
    </Badge>
  );
}

export function RoiClaimActions({
  payoutId,
  size = "sm",
}: {
  payoutId: string;
  size?: "sm" | "default";
}) {
  const qc = useQueryClient();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["super_admin", "founder", "accounts"]);
  const [open, setOpen] = React.useState(false);

  const claimQ = useQuery({
    queryKey: ["roi-claim", payoutId],
    queryFn: () => fetchClaimForPayout(payoutId),
  });
  const claim = claimQ.data ?? null;

  const generate = useMutation({
    mutationFn: (regenerate: boolean) => generateClaimForPayout({ payoutId, regenerate }),
    onSuccess: (r) => {
      toast.success(`ROI Claim ${r.claim.claim_ref_no} ready`);
      qc.invalidateQueries({ queryKey: ["roi-claim", payoutId] });
      qc.invalidateQueries({ queryKey: ["roi-claims"] });
      setOpen(true);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not generate ROI Claim"),
  });

  if (claimQ.isLoading) {
    return (
      <Button size={size} variant="outline" disabled>
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ROI Claim
      </Button>
    );
  }

  return (
    <>
      {claim ? (
        <Button size={size} variant="outline" onClick={() => setOpen(true)}>
          <FileText className="mr-1 h-3 w-3" />
          View ROI Claim
        </Button>
      ) : (
        <Button
          size={size}
          variant="outline"
          disabled={!canManage || generate.isPending}
          title={canManage ? "Generate the ROI Claim letter" : "Not permitted"}
          onClick={() => generate.mutate(false)}
        >
          {generate.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <FileText className="mr-1 h-3 w-3" />}
          Generate ROI Claim
        </Button>
      )}

      {claim && (
        <RoiClaimDialog
          open={open}
          onOpenChange={setOpen}
          claim={claim}
          canManage={canManage}
          onRegenerate={() => generate.mutate(true)}
          regenerating={generate.isPending}
        />
      )}
    </>
  );
}

export function RoiClaimDialog({
  open,
  onOpenChange,
  claim,
  canManage,
  onRegenerate,
  regenerating,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  claim: RoiClaimRow;
  canManage: boolean;
  onRegenerate: () => void;
  regenerating?: boolean;
}) {
  const qc = useQueryClient();
  const snapshot = (claim.snapshot ?? {}) as Partial<ClaimData>;
  const period = snapshot.claimPeriod ?? formatClaimPeriod(claim.claim_period);
  const name = snapshot.cityFranchiseeName ?? "";
  const base = claimFileBase({
    ...(snapshot as ClaimData),
    cityFranchiseeName: name || "Franchisee",
    claimPeriod: period,
    claimRefNo: String(claim.claim_ref_no),
  });

  // Embed the PDF from a blob object URL: signed storage URLs are not always
  // allowed to render inside an iframe, which showed as a blank/broken frame.
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [retryTick, setRetryTick] = React.useState(0);
  React.useEffect(() => {
    if (!open || !claim.pdf_path) return;
    let url: string | null = null;
    let cancelled = false;
    setPreviewError(null);
    claimObjectUrl(claim.pdf_path)
      .then((u) => {
        url = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setObjectUrl(u);
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Could not load document";
        setPreviewError(message);
      });
    return () => {
      cancelled = true;
      setObjectUrl(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, claim.pdf_path, claim.version, retryTick]);


  const setStatus = useMutation({
    mutationFn: (s: string) => updateClaimStatus(claim.id, s),
    onSuccess: () => {
      toast.success("Claim status updated");
      qc.invalidateQueries({ queryKey: ["roi-claim", claim.payout_id] });
      qc.invalidateQueries({ queryKey: ["roi-claims"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });

  const download = async (kind: "pdf" | "docx") => {
    const path = kind === "pdf" ? claim.pdf_path : claim.docx_path;
    if (!path) return toast.error(`No ${kind.toUpperCase()} stored for this claim — regenerate it.`);
    try {
      await downloadClaimFile(path, `${base}.${kind}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>FRANCHISEE ROI CLAIM · Ref {claim.claim_ref_no}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Info label="Franchisee" value={name || "—"} />
          <Info label="Claim period" value={period} />
          <Info label="Net payable" value={formatINR(Number(claim.net_payable))} />
          <Info label="Generated" value={new Date(claim.created_at).toLocaleString("en-IN")} />
          <Info label="Version" value={`v${claim.version}`} />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Claim status</div>
            {canManage ? (
              <Select value={claim.status} onValueChange={(v) => setStatus.mutate(v)}>
                <SelectTrigger className="mt-1 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLAIM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="mt-1">
                <RoiClaimStatusBadge status={claim.status} />
              </div>
            )}
          </div>
        </div>

        <div className="h-[45vh] overflow-hidden rounded-lg border border-border/60 bg-muted/20">
          {objectUrl ? (
            <iframe title="ROI Claim preview" src={objectUrl} className="h-full w-full" />
          ) : previewError ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="text-sm">
                <p className="font-medium text-foreground">Preview failed to load</p>
                <p className="mt-1 text-muted-foreground">{previewError}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  The document could not be fetched. Retrying will request it again without affecting Print.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setRetryTick((t) => t + 1)}>
                <RefreshCw className="mr-1 h-3 w-3" />
                Retry preview
              </Button>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {claim.pdf_path ? "Loading document…" : "No stored document — regenerate the claim."}
            </div>
          )}
        </div>


        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => download("pdf")}>
            <Download className="mr-1 h-3 w-3" />
            Download PDF
          </Button>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => download("docx")}>
              <Download className="mr-1 h-3 w-3" />
              Download DOCX
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!objectUrl}
            onClick={() => objectUrl && window.open(objectUrl, "_blank", "noopener")}
          >
            <Printer className="mr-1 h-3 w-3" />
            Print
          </Button>
          {canManage && (
            <Button size="sm" variant="outline" disabled={regenerating} onClick={onRegenerate}>
              {regenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              Regenerate
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium" title={value}>
        {value}
      </div>
    </div>
  );
}
