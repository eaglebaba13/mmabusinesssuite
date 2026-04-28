import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatINR } from "@/lib/format";
import { ExportBar } from "@/components/app/ExportBar";
import { defaultDateRange, exportToCSV, exportToPDF, inDateRange } from "@/lib/export";
import { ImportButton } from "@/components/app/ImportButton";

export const Route = createFileRoute("/app/finance/revenue")({
  component: RevenuePage,
});

const SOURCES = ["academy", "inventory", "franchise_fee", "consulting", "event", "other"] as const;

function RevenuePage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    source: "other" as (typeof SOURCES)[number],
    source_label: "",
    amount: "",
    received_on: new Date().toISOString().slice(0, 10),
    reference: "",
    notes: "",
  });

  const list = useQuery({
    queryKey: ["revenue-list"],
    queryFn: async () => {
      const [manual, pos] = await Promise.all([
        supabase.from("revenue_entries").select("*").order("received_on", { ascending: false }).limit(200),
        supabase
          .from("sales_orders")
          .select("id, invoice_number, grand_total, completed_at, franchisee_id")
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(200),
      ]);
      const posMapped = (pos.data ?? []).map((o: any) => ({
        id: `pos:${o.id}`,
        source: "pos_sale",
        source_label: o.invoice_number || "POS Sale",
        amount: o.grand_total,
        received_on: (o.completed_at ?? "").slice(0, 10),
        reference: o.invoice_number,
        notes: null,
        franchisee_id: o.franchisee_id,
        _readonly: true,
      }));
      return [...(manual.data ?? []), ...posMapped].sort(
        (a: any, b: any) => new Date(b.received_on).getTime() - new Date(a.received_on).getTime(),
      );
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("revenue_entries").insert({
        source: form.source,
        source_label: form.source_label || null,
        amount: Number(form.amount),
        received_on: form.received_on,
        reference: form.reference || null,
        notes: form.notes || null,
        recorded_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Revenue entry added");
      setOpen(false);
      setForm({ source: "other", source_label: "", amount: "", received_on: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["revenue-list"] });
      qc.invalidateQueries({ queryKey: ["fin-overview"] });
      qc.invalidateQueries({ queryKey: ["fin-recent"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [range, setRange] = React.useState(defaultDateRange());
  const filtered = React.useMemo(
    () => (list.data ?? []).filter((r: any) => inDateRange(r.received_on, range.from, range.to)),
    [list.data, range],
  );
  const total = filtered.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

  const exportCols = [
    { header: "Date", accessor: (r: any) => new Date(r.received_on).toLocaleDateString("en-IN") },
    { header: "Source", accessor: (r: any) => r.source.replace("_", " ") },
    { header: "Description", accessor: (r: any) => r.source_label ?? "" },
    { header: "Reference", accessor: (r: any) => r.reference ?? "" },
    { header: "Amount (INR)", accessor: (r: any) => Number(r.amount ?? 0).toFixed(2) },
    { header: "Notes", accessor: (r: any) => r.notes ?? "" },
  ];
  const fileBase = `revenue_${range.from}_to_${range.to}`;
  const handleCSV = () => exportToCSV(fileBase, filtered, exportCols);
  const handlePDF = () =>
    exportToPDF({
      filename: fileBase,
      title: "Revenue Ledger",
      subtitle: `${range.from} → ${range.to}`,
      rows: filtered,
      columns: exportCols,
      totals: [
        { label: "Entries", value: String(filtered.length) },
        { label: "Total Revenue", value: formatINR(total) },
      ],
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">Revenue Ledger</h2>
          <p className="text-xs text-muted-foreground">
            {filtered.length} entries in range · Total {formatINR(total)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton configKey="revenue_entries" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />Add Revenue</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Revenue Entry</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Source</Label>
                  <Select value={form.source} onValueChange={(v: any) => setForm({ ...form, source: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={form.received_on} onChange={(e) => setForm({ ...form, received_on: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.source_label} onChange={(e) => setForm({ ...form, source_label: e.target.value })} placeholder="e.g. New franchise — Pune" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount (₹)</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <Label>Reference</Label>
                  <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="INV-001" />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
              <Button className="w-full bg-gradient-gold text-background" disabled={!form.amount || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Saving..." : "Save Entry"}
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
          {filtered.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <div className="text-sm font-medium">{r.source_label || <span className="capitalize">{r.source.replace("_", " ")}</span>}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.received_on).toLocaleDateString("en-IN")}
                    {r.reference && ` · ${r.reference}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="border-primary/30 capitalize">{r.source.replace("_", " ")}</Badge>
                <span className="font-mono text-sm font-medium text-emerald-500">+{formatINR(r.amount)}</span>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {list.data?.length ? "No entries in selected date range." : "No revenue entries yet. Click \"Add Revenue\" to begin."}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
