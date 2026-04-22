import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatINR } from "@/lib/format";

export const Route = createFileRoute("/app/finance/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", slug: "", color: "#c9a84c", monthly_budget: "" });

  const list = useQuery({
    queryKey: ["exp-cats-full"],
    queryFn: async () => {
      const { data } = await supabase.from("expense_categories").select("*").order("name");
      const cats = data ?? [];
      // Compute spent this month per category
      const monthStart = new Date();
      monthStart.setDate(1);
      const startStr = monthStart.toISOString().slice(0, 10);
      const { data: exps } = await supabase
        .from("expenses")
        .select("category_id, amount")
        .gte("expense_date", startStr)
        .neq("status", "cancelled");
      const spentByCat = new Map<string, number>();
      (exps ?? []).forEach((e: any) => {
        if (!e.category_id) return;
        spentByCat.set(e.category_id, (spentByCat.get(e.category_id) ?? 0) + Number(e.amount ?? 0));
      });
      return cats.map((c: any) => ({ ...c, spent_this_month: spentByCat.get(c.id) ?? 0 }));
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { error } = await supabase.from("expense_categories").insert({
        name: form.name,
        slug,
        color: form.color,
        monthly_budget: Number(form.monthly_budget) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category added");
      setOpen(false);
      setForm({ name: "", slug: "", color: "#c9a84c", monthly_budget: "" });
      qc.invalidateQueries({ queryKey: ["exp-cats-full"] });
      qc.invalidateQueries({ queryKey: ["exp-cats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">Expense Categories</h2>
          <p className="text-xs text-muted-foreground">{list.data?.length ?? 0} categories</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />New Category</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Expense Category</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Logistics" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Slug (optional)</Label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto" />
                </div>
                <div>
                  <Label>Color</Label>
                  <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Monthly Budget (₹)</Label>
                <Input type="number" value={form.monthly_budget} onChange={(e) => setForm({ ...form, monthly_budget: e.target.value })} />
              </div>
              <Button className="w-full bg-gradient-gold text-background" disabled={!form.name || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Saving..." : "Create Category"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(list.data ?? []).map((c: any) => {
          const pct = c.monthly_budget > 0 ? Math.min(100, (c.spent_this_month / c.monthly_budget) * 100) : 0;
          const over = c.spent_this_month > c.monthly_budget && c.monthly_budget > 0;
          return (
            <Card key={c.id} className="glass p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${c.color}22` }}>
                  <Wallet className="h-5 w-5" style={{ color: c.color }} />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.slug}</div>
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">This month</span>
                  <span className={over ? "font-medium text-red-500" : "font-medium"}>
                    {formatINR(c.spent_this_month)} / {formatINR(c.monthly_budget)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${pct}%`, background: over ? "#ef4444" : c.color }}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
