import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, TrendingDown, Trash2 } from "lucide-react";
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
import { usePersistedState } from "@/hooks/use-persisted-state";

export const Route = createFileRoute("/app/finance/expenses")({
  component: ExpensesPage,
});

const METHODS = ["cash", "bank_transfer", "upi", "card", "cheque", "other"] as const;
const STATUSES = ["paid", "pending", "cancelled"] as const;

function ExpensesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<string>("all");

  const [form, setForm] = React.useState({
    category_id: "",
    vendor: "",
    description: "",
    amount: "",
    payment_method: "bank_transfer" as (typeof METHODS)[number],
    expense_date: new Date().toISOString().slice(0, 10),
    reference: "",
    status: "paid" as (typeof STATUSES)[number],
    notes: "",
  });

  const cats = useQuery({
    queryKey: ["exp-cats"],
    queryFn: async () => {
      const { data } = await supabase.from("expense_categories").select("*").order("name");
      return data ?? [];
    },
  });

  const list = useQuery({
    queryKey: ["expenses-list", filter],
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("*, expense_categories(name, color)")
        .order("expense_date", { ascending: false })
        .limit(300);
      if (filter !== "all") q = q.eq("category_id", filter);
      const { data } = await q;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("expenses").insert({
        category_id: form.category_id || null,
        vendor: form.vendor || null,
        description: form.description || null,
        amount: Number(form.amount),
        payment_method: form.payment_method,
        expense_date: form.expense_date,
        reference: form.reference || null,
        status: form.status,
        notes: form.notes || null,
        recorded_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense recorded");
      setOpen(false);
      setForm({
        category_id: "",
        vendor: "",
        description: "",
        amount: "",
        payment_method: "bank_transfer",
        expense_date: new Date().toISOString().slice(0, 10),
        reference: "",
        status: "paid",
        notes: "",
      });
      qc.invalidateQueries({ queryKey: ["expenses-list"] });
      qc.invalidateQueries({ queryKey: ["fin-overview"] });
      qc.invalidateQueries({ queryKey: ["fin-recent"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense moved to trash");
      qc.invalidateQueries({ queryKey: ["expenses-list"] });
      qc.invalidateQueries({ queryKey: ["fin-overview"] });
      qc.invalidateQueries({ queryKey: ["fin-recent"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [range, setRange] = React.useState(defaultDateRange());
  const filtered = React.useMemo(
    () => (list.data ?? []).filter((e: any) => inDateRange(e.expense_date, range.from, range.to)),
    [list.data, range],
  );
  const total = filtered.filter((e: any) => e.status !== "cancelled").reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);

  const exportCols = [
    { header: "Date", accessor: (e: any) => new Date(e.expense_date).toLocaleDateString("en-IN") },
    { header: "Category", accessor: (e: any) => e.expense_categories?.name ?? "" },
    { header: "Vendor", accessor: (e: any) => e.vendor ?? "" },
    { header: "Description", accessor: (e: any) => e.description ?? "" },
    { header: "Method", accessor: (e: any) => e.payment_method.replace("_", " ") },
    { header: "Reference", accessor: (e: any) => e.reference ?? "" },
    { header: "Status", accessor: (e: any) => e.status },
    { header: "Amount (INR)", accessor: (e: any) => Number(e.amount ?? 0).toFixed(2) },
  ];
  const fileBase = `expenses_${range.from}_to_${range.to}`;
  const handleCSV = () => exportToCSV(fileBase, filtered, exportCols);
  const handlePDF = () =>
    exportToPDF({
      filename: fileBase,
      title: "Expenses Report",
      subtitle: `${range.from} → ${range.to}${filter !== "all" ? " · filtered category" : ""}`,
      rows: filtered,
      columns: exportCols,
      totals: [
        { label: "Entries", value: String(filtered.length) },
        { label: "Total (excl. cancelled)", value: formatINR(total) },
      ],
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Expenses</h2>
          <p className="text-xs text-muted-foreground">
            {filtered.length} entries in range · Total {formatINR(total)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton configKey="expenses" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(cats.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />Add Expense</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {(cats.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Vendor</Label>
                  <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor name" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Amount (₹)</Label>
                    <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>Method</Label>
                    <Select value={form.payment_method} onValueChange={(v: any) => setForm({ ...form, payment_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Reference / Receipt #</Label>
                  <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>
                <Button className="w-full bg-gradient-gold text-background" disabled={!form.amount || create.isPending} onClick={() => create.mutate()}>
                  {create.isPending ? "Saving..." : "Record Expense"}
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
          {filtered.map((e: any) => (
            <div key={e.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${e.expense_categories?.color ?? "#c9a84c"}22` }}>
                  <TrendingDown className="h-4 w-4" style={{ color: e.expense_categories?.color ?? "#c9a84c" }} />
                </div>
                <div>
                  <div className="text-sm font-medium">{e.vendor || e.description || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.expense_categories?.name} · {new Date(e.expense_date).toLocaleDateString("en-IN")} · {e.payment_method.replace("_", " ")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={e.status === "paid" ? "default" : "outline"} className={e.status === "paid" ? "bg-emerald-500/20 text-emerald-400" : e.status === "pending" ? "border-amber-500/40 text-amber-500" : "border-muted"}>
                  {e.status}
                </Badge>
                <span className="font-mono text-sm text-red-500">−{formatINR(e.amount)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-red-500"
                  onClick={() => {
                    if (confirm("Move this expense to trash?")) remove.mutate(e.id);
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
              {list.data?.length ? "No expenses in selected date range." : "No expenses yet."}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
