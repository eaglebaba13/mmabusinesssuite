import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { RoiClaimDialog, RoiClaimStatusBadge } from "@/components/app/RoiClaimActions";
import {
  downloadClaimFile,
  fetchClaimsForFranchisee,
  generateClaimForPayout,
  type RoiClaimRow,
} from "@/lib/roi-claim-service";
import { claimFileBase, formatClaimPeriod, type ClaimData } from "@/lib/roi-claim";

/** ROI claim history for one franchisee (used on the franchisee dashboard). */
export function RoiClaimsPanel({ franchiseeId }: { franchiseeId: string }) {
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["super_admin", "founder", "accounts"]);
  const [openClaim, setOpenClaim] = React.useState<RoiClaimRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const claimsQ = useQuery({
    queryKey: ["roi-claims", franchiseeId],
    queryFn: () => fetchClaimsForFranchisee(franchiseeId),
  });
  const claims = claimsQ.data ?? [];

  const fileBase = (c: RoiClaimRow) => {
    const s = (c.snapshot ?? {}) as Partial<ClaimData>;
    return claimFileBase({
      ...(s as ClaimData),
      cityFranchiseeName: s.cityFranchiseeName || "Franchisee",
      claimPeriod: s.claimPeriod || formatClaimPeriod(c.claim_period),
      claimRefNo: String(c.claim_ref_no),
    });
  };

  const grab = async (c: RoiClaimRow, kind: "pdf" | "docx") => {
    const path = kind === "pdf" ? c.pdf_path : c.docx_path;
    if (!path) return toast.error(`No ${kind.toUpperCase()} stored — regenerate this claim.`);
    try {
      await downloadClaimFile(path, `${fileBase(c)}.${kind}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  return (
    <Card className="glass p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm">ROI Claims</h3>
          <p className="text-xs text-muted-foreground">Generated FRANCHISEE ROI CLAIM letters for this franchise.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border/50">
              <th className="px-2 py-2">Claim Ref No.</th>
              <th className="px-2 py-2">Claim period</th>
              <th className="px-2 py-2 text-right">Claim amount</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Generated</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id} className="border-b border-border/30">
                <td className="px-2 py-2 font-mono">{c.claim_ref_no}</td>
                <td className="px-2 py-2">{formatClaimPeriod(c.claim_period)}</td>
                <td className="px-2 py-2 text-right font-mono">{formatINR(Number(c.net_payable))}</td>
                <td className="px-2 py-2">
                  <RoiClaimStatusBadge status={c.status} />
                </td>
                <td className="px-2 py-2">{new Date(c.created_at).toLocaleDateString("en-IN")}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setOpenClaim(c)}>
                      <FileText className="mr-1 h-3 w-3" />
                      View
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => grab(c, "pdf")}>
                      <Download className="mr-1 h-3 w-3" />
                      PDF
                    </Button>
                    {canManage && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => grab(c, "docx")}>
                        <Download className="mr-1 h-3 w-3" />
                        DOCX
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!claims.length && (
              <tr>
                <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                  {claimsQ.isLoading ? "Loading…" : "No ROI claims generated yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openClaim && (
        <RoiClaimDialog
          open={!!openClaim}
          onOpenChange={(v) => !v && setOpenClaim(null)}
          claim={openClaim}
          canManage={canManage}
          regenerating={busy}
          onRegenerate={async () => {
            setBusy(true);
            try {
              const r = await generateClaimForPayout({ payoutId: openClaim.payout_id, regenerate: true });
              toast.success(`ROI Claim ${r.claim.claim_ref_no} regenerated`);
              setOpenClaim(r.claim);
              await claimsQ.refetch();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Regeneration failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </Card>
  );
}
