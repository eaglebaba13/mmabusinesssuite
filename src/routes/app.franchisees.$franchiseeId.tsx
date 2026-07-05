import * as React from "react";
import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Pencil, Power, KeyRound, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatINR, formatINRCompact } from "@/lib/format";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { FranchiseeDashboard } from "@/components/app/FranchiseeDashboard";
import { FranchiseeEditDialog } from "@/components/app/FranchiseeEditDialog";
import { resetFranchiseePassword } from "@/lib/rpc/franchisee-user.functions";
import { MonthlyRoiPanel } from "@/components/app/MonthlyRoiPanel";
import { AgreementAuditPanel } from "@/components/app/AgreementAuditPanel";
import { DocumentVault } from "@/components/app/franchise/DocumentVault";

export const Route = createFileRoute("/app/franchisees/$franchiseeId")({
  head: () => ({ meta: [{ title: "Franchisee — MMA Suite" }] }),
  component: FranchiseeDetailPage,
  errorComponent: ({ error, reset }) => {
    if (import.meta.env.DEV) console.error(error);
    return (
      <div className="p-12 text-center">
        <p className="text-destructive">Something went wrong. Please try again.</p>
        <Button onClick={reset} className="mt-4">Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="p-12 text-center">
      <p>Franchisee not found.</p>
      <Link to="/app/franchisees" className="mt-4 inline-block text-gold underline">Back</Link>
    </div>
  ),
});

function FranchiseeDetailPage() {
  const { franchiseeId } = useParams({ from: "/app/franchisees/$franchiseeId" });
  const { isAdmin, hasRole } = useAuth();
  const canManage = isAdmin || hasRole("accounts");
  const qc = useQueryClient();
  const resetFn = useServerFn(resetFranchiseePassword);
  const [editOpen, setEditOpen] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [incentiveEdit, setIncentiveEdit] = React.useState<{ mode: "new" } | { mode: "edit"; row: any } | null>(null);


  const { data: f } = useQuery({
    queryKey: ["franchisee", franchiseeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("franchisees").select("*").eq("id", franchiseeId).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["franchisee-payouts", franchiseeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roi_payouts")
        .select("*")
        .eq("franchisee_id", franchiseeId)
        .order("payout_month", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("roi_payouts")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payout marked paid");
      qc.invalidateQueries({ queryKey: ["franchisee-payouts", franchiseeId] });
    },
  });

  if (!f) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  const lifetimePaid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
  const pending = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.total_amount), 0);

  const asFranchisee =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("as_franchisee") === "1";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      {asFranchisee && (
        <div className="sticky top-0 z-30 -mx-4 -mt-4 flex items-center justify-between rounded-b-xl border-b border-gold/30 bg-gradient-to-r from-gold/20 to-amber-500/10 px-4 py-3 backdrop-blur md:-mx-8 md:-mt-8 md:px-8">
          <div className="text-sm">
            <span className="font-medium">Viewing as {f.full_name}</span>
            <span className="ml-2 text-xs text-muted-foreground">read-only · admin view</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-gold/40"
            onClick={() => window.close()}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Master
          </Button>
        </div>
      )}
      {!asFranchisee && (
        <Link to="/app/franchisees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      )}

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="bg-card/40">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="roi">Monthly ROI</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="ledger">ROI Ledger</TabsTrigger>
          <TabsTrigger value="agreement">Agreement</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <FranchiseeDashboard
            franchiseeId={f.id}
            franchiseeName={f.full_name}
            investment={Number(f.investment_amount)}
            joinedAt={f.joined_at}
            status={f.status}
            territoryId={f.territory_id}
          />
        </TabsContent>

        <TabsContent value="roi" className="space-y-6">
          <MonthlyRoiPanel franchiseeId={f.id} />
        </TabsContent>

        <TabsContent value="profile" className="space-y-6">
          <div className="rounded-2xl glass p-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-display text-3xl">{f.full_name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{f.email ?? "—"} · {f.phone ?? "—"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-gold/40 text-gold capitalize">{f.status}</Badge>
                  {(f as any).franchise_type && (
                    <Badge variant="outline" className="border-border capitalize">{(f as any).franchise_type} franchise</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Agreement tile row — replaces single Investment card */}
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Investment</div>
                <div className="mt-1 font-display text-xl text-gradient-gold">{formatINRCompact(Number(f.investment_amount))}</div>
              </div>
              <div className="rounded-xl bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Agreement</div>
                <div className="mt-1 text-sm">{(f as any).agreement_version ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground">{(f as any).agreement_date ?? "—"}</div>
              </div>
              <div className="rounded-xl bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Territory</div>
                <div className="mt-1 text-sm">{f.territory_id ? f.territory_id.slice(0, 8) : "—"}</div>
              </div>
              <div className="rounded-xl bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Agreement status</div>
                <div className="mt-1 text-sm capitalize">
                  {agreementStatus(f)}
                </div>
                <div className="text-[11px] text-muted-foreground">exp {(f as any).agreement_expiry ?? "—"}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lifetime ROI paid</div>
                <div className="mt-1 font-display text-xl text-gradient-gold">{formatINRCompact(lifetimePaid)}</div>
              </div>
              <div className="rounded-xl bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending payouts</div>
                <div className="mt-1 font-display text-xl text-gradient-gold">{formatINRCompact(pending)}</div>
              </div>
            </div>

            {f.notes && (
              <div className="mt-6 rounded-xl bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</div>
                <p className="mt-1 text-sm">{f.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="agreement" className="space-y-6">
          <AgreementAuditPanel franchiseeId={f.id} />
        </TabsContent>


        <TabsContent value="ledger" className="space-y-6">
          <div className="rounded-2xl glass p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl">ROI ledger</h3>
              {canManage && (
                <Button size="sm" variant="outline" className="border-gold/40" onClick={() => setIncentiveEdit({ mode: "new" })}>
                  <Pencil className="mr-1 h-3 w-3" /> Post / replace incentive
                </Button>
              )}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left">Month</th>
                    <th className="px-2 py-2 text-right">Base ROI</th>
                    <th className="px-2 py-2 text-right">Nail Emporium</th>
                    <th className="px-2 py-2 text-right">Academy</th>
                    <th className="px-2 py-2 text-right">Dark Store</th>
                    <th className="px-2 py-2 text-right">Total</th>
                    <th className="px-2 py-2 text-center">Status</th>
                    {canManage && <th className="px-2 py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} className="border-b border-border/40">
                      <td className="px-2 py-2">{format(new Date(p.payout_month), "MMM yyyy")}</td>
                      <td className="px-2 py-2 text-right">{formatINRCompact(Number(p.base_roi))}</td>
                      <td className="px-2 py-2 text-right">{formatINRCompact(Number(p.emporium_incentive))}</td>
                      <td className="px-2 py-2 text-right">{formatINRCompact(Number(p.academy_incentive))}</td>
                      <td className="px-2 py-2 text-right">{formatINRCompact(Number(p.dark_store_incentive))}</td>
                      <td className="px-2 py-2 text-right font-semibold text-gold">{formatINRCompact(Number(p.total_amount))}</td>
                      <td className="px-2 py-2 text-center">
                        <Badge variant="outline" className={p.status === "paid" ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}>{p.status}</Badge>
                      </td>
                      {canManage && (
                        <td className="px-2 py-2 text-right space-x-1">
                          {p.status === "pending" && (
                            <Button size="sm" variant="ghost" onClick={() => markPaid.mutate(p.id)}>
                              <CheckCircle2 className="mr-1 h-3 w-3" />Mark paid
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setIncentiveEdit({ mode: "edit", row: p })}>
                            <Pencil className="mr-1 h-3 w-3" /> Edit
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {payouts.length === 0 && (
                    <tr><td colSpan={canManage ? 8 : 7} className="px-2 py-8 text-center text-muted-foreground">No payouts yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      {canManage && incentiveEdit && (
        <IncentiveEditDialog
          franchiseeId={f.id}
          franchiseeName={f.full_name}
          existing={incentiveEdit.mode === "edit" ? incentiveEdit.row : null}
          onClose={() => setIncentiveEdit(null)}
          onSaved={() => {
            setIncentiveEdit(null);
            qc.invalidateQueries({ queryKey: ["franchisee-payouts", franchiseeId] });
            qc.invalidateQueries({ queryKey: ["fr-dash-payouts", franchiseeId] });
          }}
        />
      )}

    </div>
  );
}

function IncentiveEditDialog({
  franchiseeId,
  franchiseeName,
  existing,
  onClose,
  onSaved,
}: {
  franchiseeId: string;
  franchiseeName: string;
  existing: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existing;
  const [month, setMonth] = React.useState<string>(
    existing ? String(existing.payout_month).slice(0, 7) : new Date().toISOString().slice(0, 7),
  );
  const [amount, setAmount] = React.useState<string>(
    existing ? String(Number(existing.dark_store_incentive || 0)) : "",
  );
  const [remarks, setRemarks] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    const amt = Number(amount);
    if (!amt || amt < 0) {
      toast.error("Enter a valid incentive amount");
      return;
    }
    if (!remarks.trim()) {
      toast.error("Remarks are mandatory for manual incentive changes");
      return;
    }
    setSaving(true);
    try {
      const payoutMonth = `${month}-01`;
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      if (isEdit) {
        const previous = {
          base_roi: Number(existing.base_roi),
          emporium_incentive: Number(existing.emporium_incentive),
          academy_incentive: Number(existing.academy_incentive),
          dark_store_incentive: Number(existing.dark_store_incentive),
          total_amount: Number(existing.total_amount),
          status: existing.status,
        };
        const newTotal = Number(existing.base_roi) + Number(existing.emporium_incentive) + Number(existing.academy_incentive) + amt;
        const { error } = await supabase
          .from("roi_payouts")
          .update({
            dark_store_incentive: amt,
            total_amount: newTotal,
            status: "paid",
            paid_at: existing.paid_at ?? new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          action: "manual_incentive_edit",
          entity: "roi_payouts",
          entity_id: existing.id,
          user_id: userId,
          metadata: {
            franchisee_id: franchiseeId,
            franchisee_name: franchiseeName,
            month: payoutMonth,
            category: "monthly_incentive",
            previous,
            new_amount: amt,
            remarks,
          },
        });
        toast.success("Incentive updated");
      } else {
        // Duplicate check: same franchisee + same month + existing dark_store_incentive > 0
        const { data: dup } = await supabase
          .from("roi_payouts")
          .select("id, dark_store_incentive")
          .eq("franchisee_id", franchiseeId)
          .eq("payout_month", payoutMonth);
        const dupRow = (dup ?? []).find((r) => Number(r.dark_store_incentive) > 0);
        if (dupRow) {
          toast.error("An incentive already exists for this month. Use Edit to replace it.");
          setSaving(false);
          return;
        }
        const { data: inserted, error } = await supabase
          .from("roi_payouts")
          .insert({
            franchisee_id: franchiseeId,
            payout_month: payoutMonth,
            base_roi: 0,
            emporium_incentive: 0,
            academy_incentive: 0,
            dark_store_incentive: amt,
            total_amount: amt,
            status: "paid",
            paid_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          action: "manual_incentive_post",
          entity: "roi_payouts",
          entity_id: inserted!.id,
          user_id: userId,
          metadata: {
            franchisee_id: franchiseeId,
            franchisee_name: franchiseeName,
            month: payoutMonth,
            category: "monthly_incentive",
            amount: amt,
            remarks,
          },
        });
        toast.success("Incentive posted");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save incentive");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit monthly incentive" : "Post monthly incentive"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Franchisee</Label>
            <p className="text-sm text-muted-foreground">{franchiseeName}</p>
          </div>
          <div>
            <Label htmlFor="inc-month">Payout month</Label>
            <Input id="inc-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={isEdit} />
          </div>
          <div>
            <Label htmlFor="inc-amount">Incentive amount (₹)</Label>
            <Input id="inc-amount" type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">Separate from base ROI. Saved under Dark Store / monthly incentive bucket.</p>
          </div>
          <div>
            <Label htmlFor="inc-remarks">Remarks (required)</Label>
            <Textarea
              id="inc-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={isEdit ? "Reason for replacing this incentive…" : "e.g. Manual May incentive update"}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Replace" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function agreementStatus(f: any): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!f.agreement_expiry) return "missing";
  if (f.agreement_expiry < today) return "expired";
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  if (f.agreement_expiry <= in30.toISOString().slice(0, 10)) return "expiring";
  return "active";
}
