import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Coins, CheckCircle2, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR } from "@/lib/format";
import { ExportBar } from "@/components/app/ExportBar";
import { defaultDateRange, exportToCSV, exportToPDF, inDateRange } from "@/lib/export";
import { ImportButton } from "@/components/app/ImportButton";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { RoiClaimActions } from "@/components/app/RoiClaimActions";
import { generateClaimForPayout, generateClaimsForPayouts } from "@/lib/roi-claim-service";
import { effectiveTermsForMonth, computeRoi } from "@/lib/roi-effective";

export const Route = createFileRoute("/app/finance/payouts")({
  component: PayoutsPage,
});

function PayoutsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const emptyPayout = {
    franchisee_id: "",
    payout_month: new Date().toISOString().slice(0, 7) + "-01",
    base_roi: "",
    academy_incentive: "",
    dark_store_incentive: "",
    emporium_incentive: "",
  };
  const [form, setForm, clearFormDraft] = usePersistedState("finance.payouts.new", emptyPayout);

  const franchisees = useQuery({
    queryKey: ["fr-active"],
    queryFn: async () => {
      const { data } = await supabase.from("franchisees").select("id, full_name").eq("status", "active").order("full_name");
      return data ?? [];
    },
  });

  const list = useQuery({
    queryKey: ["roi-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("roi_payouts")
        .select("*, franchisees(full_name)")
        .order("payout_month", { ascending: false });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const base = Number(form.base_roi) || 0;
      const ai = Number(form.academy_incentive) || 0;
      const ds = Number(form.dark_store_incentive) || 0;
      const em = Number(form.emporium_incentive) || 0;
      const { data: inserted, error } = await supabase
        .from("roi_payouts")
        .insert({
          franchisee_id: form.franchisee_id,
          payout_month: form.payout_month,
          base_roi: base,
          academy_incentive: ai,
          dark_store_incentive: ds,
          emporium_incentive: em,
          total_amount: base + ai + ds + em,
          status: "pending",
        })
        .select("id")
        .single();
      if (error) throw error;
      // Auto-generate the ROI Claim letter for the new payout (best effort).
      let claimWarning: string | null = null;
      try {
        await generateClaimForPayout({ payoutId: inserted.id });
      } catch (e) {
        claimWarning = e instanceof Error ? e.message : "ROI Claim could not be generated";
      }
      return { claimWarning };
    },
    onSuccess: (r) => {
      toast.success("Payout created");
      if (r?.claimWarning) toast.warning(`ROI Claim not generated: ${r.claimWarning}`);
      setOpen(false);
      setForm({ ...emptyPayout, payout_month: new Date().toISOString().slice(0, 7) + "-01" });
      clearFormDraft();
      qc.invalidateQueries({ queryKey: ["roi-list"] });
      qc.invalidateQueries({ queryKey: ["fin-overview"] });
      qc.invalidateQueries({ queryKey: ["roi-claims"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roi_payouts").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as paid");
      qc.invalidateQueries({ queryKey: ["roi-list"] });
      qc.invalidateQueries({ queryKey: ["fin-overview"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from("roi_payouts").delete({ count: "exact" }).eq("id", id);
      if (error) throw error;
      if (!count) throw new Error("Not permitted to delete this payout");
    },
    onSuccess: () => {
      toast.success("Payout deleted");
      qc.invalidateQueries({ queryKey: ["roi-list"] });
      qc.invalidateQueries({ queryKey: ["fin-overview"] });
      qc.invalidateQueries({ queryKey: ["roi-payouts"] });
      qc.invalidateQueries({ queryKey: ["franchisee-payouts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });


  const [genMonth, setGenMonth] = React.useState(() => new Date().toISOString().slice(0, 7));

  // Generates / corrects pending ROI rows for EVERY active franchisee for the chosen month.
  // Uses the terms that were in force that month (investment upgrades apply only from their effective month).
  const autoGenerate = useMutation({
    mutationFn: async () => {
      const payoutMonth = `${genMonth}-01`;
      const [{ data: frs, error: fe }, { data: changes }, { data: existing }] = await Promise.all([
        supabase
          .from("franchisees")
          .select("id, investment_amount, mg_percent, tns_percent, academy_percent, mall_percent, joined_at")
          .eq("status", "active")
          .eq("is_demo", false),
        (supabase as any).from("franchise_product_changes").select("franchisee_id, effective_date, old_values_json"),
        supabase.from("roi_payouts").select("id, franchisee_id, status, auto_computed").eq("payout_month", payoutMonth),
      ]);
      if (fe) throw fe;
      const monthEnd = new Date(Number(genMonth.slice(0, 4)), Number(genMonth.slice(5, 7)), 0).toISOString().slice(0, 10);
      const existingBy = new Map((existing ?? []).map((p: any) => [p.franchisee_id, p]));
      const toInsert: any[] = [];
      let updated = 0;
      for (const f of frs ?? []) {
        if (f.joined_at && f.joined_at.slice(0, 10) > monthEnd) continue; // not yet joined
        const ex: any = existingBy.get(f.id);
        if (ex && (ex.status === "paid" || ex.auto_computed === false)) continue; // never touch paid / manual rows
        const { data: r } = await supabase.rpc("compute_franchisee_monthly_roi", { _franchisee_id: f.id, _month: payoutMonth });
        const tot = (r ?? [])[0] as any;
        const terms = effectiveTermsForMonth(
          {
            investment_amount: Number(f.investment_amount ?? 0),
            mg_percent: Number(f.mg_percent ?? 0),
            tns_percent: Number(f.tns_percent ?? 0),
            academy_percent: Number(f.academy_percent ?? 0),
            mall_percent: Number(f.mall_percent ?? 0),
          },
          (changes ?? []).filter((c: any) => c.franchisee_id === f.id),
          payoutMonth,
        );
        const totals = { tns: Number(tot?.tns_total ?? 0), academy: Number(tot?.academy_total ?? 0), mall: Number(tot?.mall_total ?? 0) };
        const roi = computeRoi(terms, totals);
        const row = {
          tns_amount: totals.tns,
          academy_amount: totals.academy,
          mall_amount: totals.mall,
          mg_amount: roi.mg,
          variable_roi: roi.variable,
          final_payable: roi.final,
          payable_reason: roi.reason,
          base_roi: roi.mg,
          emporium_incentive: roi.a,
          academy_incentive: roi.b,
          dark_store_incentive: roi.c,
          total_amount: roi.final,
        };
        if (ex) {
          const { error } = await supabase.from("roi_payouts").update(row).eq("id", ex.id).neq("status", "paid");
          if (error) throw error;
          updated++;
        } else {
          toInsert.push({ ...row, franchisee_id: f.id, payout_month: payoutMonth, status: "pending", auto_computed: true });
        }
      }
      let claims: Awaited<ReturnType<typeof generateClaimsForPayouts>> | null = null;
      if (toInsert.length) {
        const { data: rows, error } = await supabase.from("roi_payouts").insert(toInsert).select("id");
        if (error) throw error;
        claims = await generateClaimsForPayouts((rows ?? []).map((r) => r.id));
      }
      return { inserted: toInsert.length, updated, claims };
    },
    onSuccess: (r) => {
      toast.success(`${r.inserted} new payout(s), ${r.updated} recalculated for ${genMonth}`);
      if (r.claims?.failed.length) toast.warning(`${r.claims.failed.length} ROI Claim(s) not generated: ${r.claims.failed[0].message}`);
      qc.invalidateQueries({ queryKey: ["roi-list"] });
      qc.invalidateQueries({ queryKey: ["fin-overview"] });
      qc.invalidateQueries({ queryKey: ["roi-claims"] });
      qc.invalidateQueries({ queryKey: ["fr-dash-payouts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [range, setRange] = React.useState(() => {
    const d = defaultDateRange();
    const fromD = new Date();
    fromD.setMonth(fromD.getMonth() - 12);
    return { from: fromD.toISOString().slice(0, 10), to: d.to };
  });

  const filtered = React.useMemo(
    () => (list.data ?? []).filter((p: any) => inDateRange(p.payout_month, range.from, range.to)),
    [list.data, range],
  );

  const grouped = React.useMemo(() => {
    const pending = filtered.filter((p: any) => p.status === "pending");
    const paid = filtered.filter((p: any) => p.status === "paid");
    const pendingTotal = pending.reduce((s: number, p: any) => s + Number(p.total_amount ?? 0), 0);
    const paidTotal = paid.reduce((s: number, p: any) => s + Number(p.total_amount ?? 0), 0);
    return { pending, paid, pendingTotal, paidTotal };
  }, [filtered]);

  const exportCols = [
    { header: "Payout Month", accessor: (p: any) => new Date(p.payout_month).toLocaleString("en-IN", { month: "long", year: "numeric" }) },
    { header: "Franchisee", accessor: (p: any) => p.franchisees?.full_name ?? "" },
    { header: "Base ROI", accessor: (p: any) => Number(p.base_roi ?? 0).toFixed(2) },
    { header: "Academy Incentive", accessor: (p: any) => Number(p.academy_incentive ?? 0).toFixed(2) },
    { header: "Dark Store Incentive", accessor: (p: any) => Number(p.dark_store_incentive ?? 0).toFixed(2) },
    { header: "Emporium Incentive", accessor: (p: any) => Number(p.emporium_incentive ?? 0).toFixed(2) },
    { header: "Total (INR)", accessor: (p: any) => Number(p.total_amount ?? 0).toFixed(2) },
    { header: "Status", accessor: (p: any) => p.status },
    { header: "Paid At", accessor: (p: any) => (p.paid_at ? new Date(p.paid_at).toLocaleDateString("en-IN") : "") },
  ];
  const fileBase = `roi_payouts_${range.from}_to_${range.to}`;
  const handleCSV = () => exportToCSV(fileBase, filtered, exportCols);
  const handlePDF = () =>
    exportToPDF({
      filename: fileBase,
      title: "ROI Payouts",
      subtitle: `${range.from} → ${range.to}`,
      rows: filtered,
      columns: exportCols,
      totals: [
        { label: "Payouts", value: String(filtered.length) },
        { label: "Paid", value: `${grouped.paid.length} (${formatINR(grouped.paidTotal)})` },
        { label: "Pending", value: `${grouped.pending.length} (${formatINR(grouped.pendingTotal)})` },
      ],
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">ROI Payouts</h2>
          <p className="text-xs text-muted-foreground">
            {grouped.pending.length} pending ({formatINR(grouped.pendingTotal)}) · {grouped.paid.length} paid ({formatINR(grouped.paidTotal)})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => autoGenerate.mutate()}
            disabled={autoGenerate.isPending}
            title="Calculate this month's payouts from completed POS sales"
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {autoGenerate.isPending ? "Generating..." : "Auto-generate"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />New Payout</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create ROI Payout</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Franchisee</Label>
                <Select value={form.franchisee_id} onValueChange={(v) => setForm({ ...form, franchisee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(franchisees.data ?? []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payout Month</Label>
                <Input type="date" value={form.payout_month} onChange={(e) => setForm({ ...form, payout_month: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Base ROI (₹)</Label><Input type="number" value={form.base_roi} onChange={(e) => setForm({ ...form, base_roi: e.target.value })} /></div>
                <div><Label>Academy Incentive (₹)</Label><Input type="number" value={form.academy_incentive} onChange={(e) => setForm({ ...form, academy_incentive: e.target.value })} /></div>
                <div><Label>Dark Store Incentive (₹)</Label><Input type="number" value={form.dark_store_incentive} onChange={(e) => setForm({ ...form, dark_store_incentive: e.target.value })} /></div>
                <div><Label>Emporium Incentive (₹)</Label><Input type="number" value={form.emporium_incentive} onChange={(e) => setForm({ ...form, emporium_incentive: e.target.value })} /></div>
              </div>
              <Button className="w-full bg-gradient-gold text-background" disabled={!form.franchisee_id || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Saving..." : "Create Payout"}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <ExportBar
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onCSV={handleCSV}
        onPDF={handlePDF}
        count={filtered.length}
      />

      <Card className="glass">
        <div className="divide-y divide-border/50">
          {filtered.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Coins className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">{p.franchisees?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(p.payout_month).toLocaleString("en-IN", { month: "long", year: "numeric" })}
                    {" · "}Base {formatINR(p.base_roi)} · Acad {formatINR(p.academy_incentive)} · DS {formatINR(p.dark_store_incentive)} · Emp {formatINR(p.emporium_incentive)}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <span className="font-mono text-sm font-medium">{formatINR(p.total_amount)}</span>
                <RoiClaimActions payoutId={p.id} />
                <Badge variant="outline" className={p.status === "paid" ? "border-emerald-500/40 text-emerald-500" : p.status === "overdue" ? "border-red-500/40 text-red-500" : "border-amber-500/40 text-amber-500"}>
                  {p.status}
                </Badge>
                {p.status === "pending" && (
                  <Button size="sm" variant="outline" onClick={() => markPaid.mutate(p.id)} disabled={markPaid.isPending}>
                    <CheckCircle2 className="mr-1 h-3 w-3" />Mark Paid
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-red-500"
                  onClick={() => {
                    if (confirm("Move this payout to trash?")) remove.mutate(p.id);
                  }}
                  disabled={remove.isPending}
                  title="Move to trash"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {list.data?.length ? "No payouts in selected date range." : "No payouts yet."}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
