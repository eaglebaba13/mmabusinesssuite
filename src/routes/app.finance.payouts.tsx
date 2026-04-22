import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Coins, CheckCircle2 } from "lucide-react";
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

export const Route = createFileRoute("/app/finance/payouts")({
  component: PayoutsPage,
});

function PayoutsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    franchisee_id: "",
    payout_month: new Date().toISOString().slice(0, 7) + "-01",
    base_roi: "",
    academy_incentive: "",
    dark_store_incentive: "",
    emporium_incentive: "",
  });

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
      setForm({ franchisee_id: "", payout_month: new Date().toISOString().slice(0, 7) + "-01", base_roi: "", academy_incentive: "", dark_store_incentive: "", emporium_incentive: "" });
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

  const grouped = React.useMemo(() => {
    const pending = (list.data ?? []).filter((p: any) => p.status === "pending");
    const paid = (list.data ?? []).filter((p: any) => p.status === "paid");
    const pendingTotal = pending.reduce((s: number, p: any) => s + Number(p.total_amount ?? 0), 0);
    const paidTotal = paid.reduce((s: number, p: any) => s + Number(p.total_amount ?? 0), 0);
    return { pending, paid, pendingTotal, paidTotal };
  }, [list.data]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">ROI Payouts</h2>
          <p className="text-xs text-muted-foreground">
            {grouped.pending.length} pending ({formatINR(grouped.pendingTotal)}) · {grouped.paid.length} paid ({formatINR(grouped.paidTotal)})
          </p>
        </div>
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

      <Card className="glass">
        <div className="divide-y divide-border/50">
          {(list.data ?? []).map((p: any) => (
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
              </div>
            </div>
          ))}
          {!list.data?.length && (
            <div className="p-8 text-center text-sm text-muted-foreground">No payouts yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
