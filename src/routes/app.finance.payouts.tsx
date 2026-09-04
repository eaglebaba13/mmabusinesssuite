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
      const { error } = await supabase.from("roi_payouts").insert({
        franchisee_id: form.franchisee_id,
        payout_month: form.payout_month,
        base_roi: base,
        academy_incentive: ai,
        dark_store_incentive: ds,
        emporium_incentive: em,
        total_amount: base + ai + ds + em,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payout created");
      setOpen(false);
      setForm({ ...emptyPayout, payout_month: new Date().toISOString().slice(0, 7) + "-01" });
      clearFormDraft();
      qc.invalidateQueries({ queryKey: ["roi-list"] });
      qc.invalidateQueries({ queryKey: ["fin-overview"] });
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


  const autoGenerate = useMutation({
    mutationFn: async () => {
      // Compute current month boundaries
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const payoutMonth = monthStart.toISOString().slice(0, 10);

      const [{ data: frs }, { data: sales }, { data: existing }] = await Promise.all([
        supabase.from("franchisees").select("id, full_name, base_roi_pct, academy_pct, dark_store_pct, emporium_pct").eq("status", "active"),
        supabase
          .from("sales_orders")
          .select("franchisee_id, grand_total")
          .eq("status", "completed")
          .gte("completed_at", monthStart.toISOString())
          .lt("completed_at", monthEnd.toISOString()),
        supabase.from("roi_payouts").select("franchisee_id").eq("payout_month", payoutMonth),
      ]);

      const existingSet = new Set((existing ?? []).map((p: any) => p.franchisee_id));
      const totals = new Map<string, number>();
      (sales ?? []).forEach((s: any) => {
        if (!s.franchisee_id) return;
        totals.set(s.franchisee_id, (totals.get(s.franchisee_id) ?? 0) + Number(s.grand_total ?? 0));
      });

      const toInsert: any[] = [];
      for (const f of frs ?? []) {
        if (existingSet.has(f.id)) continue;
        const sales_total = totals.get(f.id) ?? 0;
        if (sales_total <= 0) continue;
        const base = (sales_total * Number(f.base_roi_pct ?? 0)) / 100;
        const ai = (sales_total * Number(f.academy_pct ?? 0)) / 100;
        const ds = (sales_total * Number(f.dark_store_pct ?? 0)) / 100;
        const em = (sales_total * Number(f.emporium_pct ?? 0)) / 100;
        toInsert.push({
          franchisee_id: f.id,
          payout_month: payoutMonth,
          base_roi: base,
          academy_incentive: ai,
          dark_store_incentive: ds,
          emporium_incentive: em,
          total_amount: base + ai + ds + em,
          status: "pending",
        });
      }

      if (!toInsert.length) return { inserted: 0 };
      const { error } = await supabase.from("roi_payouts").insert(toInsert);
      if (error) throw error;
      return { inserted: toInsert.length };
    },
    onSuccess: (r) => {
      if (!r || r.inserted === 0) {
        toast.info("No new payouts — all active franchisees with sales this month already have payouts.");
      } else {
        toast.success(`Generated ${r.inserted} payout${r.inserted > 1 ? "s" : ""} from this month's sales`);
      }
      qc.invalidateQueries({ queryKey: ["roi-list"] });
      qc.invalidateQueries({ queryKey: ["fin-overview"] });
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
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium">{formatINR(p.total_amount)}</span>
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
