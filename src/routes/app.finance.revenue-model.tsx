import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Target, Save, RefreshCw, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBlockFranchiseeRoute } from "@/hooks/use-role-guard";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatINR, formatINRCompact } from "@/lib/format";
import { KpiCard } from "@/components/app/KpiCard";
import { ImportButton } from "@/components/app/ImportButton";

export const Route = createFileRoute("/app/finance/revenue-model")({
  head: () => ({ meta: [{ title: "Revenue Model — MMA Suite" }] }),
  component: RevenueModelPage,
});

type ModelItem = {
  id: string;
  sort_order: number;
  category: string;
  particulars: string;
  description: string | null;
  mrp: number;
  offer_value: number;
  offer_cost: number;
  target_segment: string | null;
  default_target: number;
  franchisee_roi_pct: number;
  state_partner_pct: number;
};

type Franchisee = {
  id: string;
  full_name: string;
};

type TargetRow = {
  id: string;
  franchisee_id: string | null;
  city: string;
  model_item_id: string;
  target_numbers: number;
};

const ALL = "__all__";

function RevenueModelPage() {
  useBlockFranchiseeRoute();
  const { isAdmin, hasRole } = useAuth();
  const canEditModel = isAdmin || hasRole("accounts");
  const qc = useQueryClient();
  const [franchiseeId, setFranchiseeId] = React.useState<string>(ALL);
  const [city, setCity] = React.useState<string>("");
  const [draft, setDraft] = React.useState<Record<string, number>>({});
  const [editItem, setEditItem] = React.useState<ModelItem | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ["revenue-model-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue_model_items")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data as ModelItem[];
    },
  });

  const { data: franchisees = [] } = useQuery({
    queryKey: ["franchisees-mini"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("franchisees")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return data as Franchisee[];
    },
  });

  const targetsKey = ["franchisee-targets", franchiseeId, city];
  const { data: targets = [] } = useQuery({
    queryKey: targetsKey,
    queryFn: async () => {
      let q = supabase.from("franchisee_targets").select("*");
      q = franchiseeId === ALL ? q.is("franchisee_id", null) : q.eq("franchisee_id", franchiseeId);
      q = q.eq("city", city);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TargetRow[];
    },
  });

  // Map of model_item_id → effective target (override if exists, else default)
  const effective = React.useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => map.set(i.id, i.default_target));
    targets.forEach((t) => map.set(t.model_item_id, t.target_numbers));
    return map;
  }, [items, targets]);

  const valueFor = (itemId: string) =>
    draft[itemId] ?? effective.get(itemId) ?? 0;

  const dirty = Object.keys(draft).length > 0;

  const save = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(draft).map(([model_item_id, target_numbers]) => ({
        franchisee_id: franchiseeId === ALL ? null : franchiseeId,
        city: city || "",
        model_item_id,
        target_numbers: Number(target_numbers) || 0,
        period_month: "1900-01-01",
      }));
      if (!rows.length) return;
      const { error } = await supabase
        .from("franchisee_targets")
        .upsert(rows, { onConflict: "franchisee_id,city,model_item_id,period_month" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Targets saved");
      setDraft({});
      qc.invalidateQueries({ queryKey: targetsKey });
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const updateItem = useMutation({
    mutationFn: async (patch: Partial<ModelItem> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("revenue_model_items").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item updated");
      setEditItem(null);
      qc.invalidateQueries({ queryKey: ["revenue-model-items"] });
    },
    onError: (e: any) => toast.error(e.message || "Update failed"),
  });

  // Totals
  const rows = items.map((i) => {
    const t = valueFor(i.id);
    const totalRevenue = t * Number(i.offer_value);
    const totalCost = t * Number(i.offer_cost);
    const mmaProfit = totalRevenue - totalCost;
    const franchiseeROI = (mmaProfit * Number(i.franchisee_roi_pct)) / 100;
    const statePartner = (mmaProfit * Number(i.state_partner_pct)) / 100;
    const grossProfit = mmaProfit - franchiseeROI - statePartner;
    return { item: i, target: t, totalRevenue, totalCost, mmaProfit, franchiseeROI, statePartner, grossProfit };
  });

  const totals = rows.reduce(
    (s, r) => ({
      revenue: s.revenue + r.totalRevenue,
      cost: s.cost + r.totalCost,
      mma: s.mma + r.mmaProfit,
      franchisee: s.franchisee + r.franchiseeROI,
      state: s.state + r.statePartner,
      gross: s.gross + r.grossProfit,
    }),
    { revenue: 0, cost: 0, mma: 0, franchisee: 0, state: 0, gross: 0 },
  );

  const scopeLabel =
    franchiseeId === ALL
      ? city
        ? `City template — ${city}`
        : "Master template"
      : franchisees.find((f) => f.id === franchiseeId)?.full_name + (city ? ` · ${city}` : "");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Planning</p>
          <h2 className="mt-1 font-display text-2xl">Revenue Model · Per City / Franchisee Targets</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set sales targets for each line item. MMA profit, franchisee ROI and state partner share recompute live.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Scope</Label>
            <Select value={franchiseeId} onValueChange={(v) => { setFranchiseeId(v); setDraft({}); }}>
              <SelectTrigger className="mt-1 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Master template (all)</SelectItem>
                {franchisees.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">City</Label>
            <Input
              placeholder="e.g. Mumbai"
              value={city}
              onChange={(e) => { setCity(e.target.value); setDraft({}); }}
              className="mt-1 w-[180px]"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setDraft({})}
            disabled={!dirty}
          >
            <RefreshCw className="mr-1 h-4 w-4" /> Reset
          </Button>
          <Button
            className="bg-gradient-gold text-background"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save className="mr-1 h-4 w-4" /> {save.isPending ? "Saving…" : "Save targets"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-gold/40 text-gold">
          <Target className="mr-1 h-3 w-3" /> {scopeLabel}
        </Badge>
        {franchiseeId === ALL && !city && (
          <span className="text-xs text-muted-foreground">
            Defaults from spreadsheet. Pick a franchisee + city to plan a specific store.
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Planned Revenue" value={formatINRCompact(totals.revenue)} icon={Target} delay={0} />
        <KpiCard label="Program Cost" value={formatINRCompact(totals.cost)} icon={Target} delay={0.05} />
        <KpiCard label="MMA Profit" value={formatINRCompact(totals.mma)} icon={Target} delay={0.1} />
        <KpiCard label="Franchisee ROI" value={formatINRCompact(totals.franchisee)} icon={Target} delay={0.15} />
        <KpiCard label="State Partner" value={formatINRCompact(totals.state)} icon={Target} delay={0.2} />
        <KpiCard label="Company Gross" value={formatINRCompact(totals.gross)} icon={Target} delay={0.25} />
      </div>

      <Card className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-card/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">#</th>
                <th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-left">Particulars</th>
                <th className="px-3 py-3 text-right">MRP</th>
                <th className="px-3 py-3 text-right">Offer</th>
                <th className="px-3 py-3 text-right">Cost</th>
                <th className="px-3 py-3 text-left">Segment</th>
                <th className="px-3 py-3 text-center w-[110px]">Target</th>
                <th className="px-3 py-3 text-right">Revenue</th>
                <th className="px-3 py-3 text-right">MMA Profit</th>
                <th className="px-3 py-3 text-right">F'see ROI</th>
                <th className="px-3 py-3 text-right">State</th>
                <th className="px-3 py-3 text-right">Gross</th>
                {canEditModel && <th className="px-3 py-3 text-center w-[60px]"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, target, totalRevenue, mmaProfit, franchiseeROI, statePartner, grossProfit }) => {
                const overridden = draft[item.id] !== undefined;
                return (
                  <tr key={item.id} className="border-t border-border/40 hover:bg-card/30">
                    <td className="px-3 py-3 text-muted-foreground">{item.sort_order}</td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="border-gold/30 text-xs">{item.category}</Badge>
                    </td>
                    <td className="px-3 py-3 max-w-[280px]">
                      <div className="font-medium">{item.particulars}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground">{item.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{item.mrp ? formatINR(item.mrp) : "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{formatINR(item.offer_value)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground">{formatINR(item.offer_cost)}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground capitalize">{item.target_segment ?? "—"}</td>
                    <td className="px-3 py-3 text-center">
                      <Input
                        type="number"
                        min={0}
                        value={target}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [item.id]: Number(e.target.value) || 0 }))
                        }
                        className={`mx-auto h-8 w-[90px] text-center ${overridden ? "border-gold/60" : ""}`}
                      />
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{formatINRCompact(totalRevenue)}</td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-500">{formatINRCompact(mmaProfit)}</td>
                    <td className="px-3 py-3 text-right font-mono text-gold">{formatINRCompact(franchiseeROI)} <span className="text-[10px] text-muted-foreground">({item.franchisee_roi_pct}%)</span></td>
                    <td className="px-3 py-3 text-right font-mono text-muted-foreground">{formatINRCompact(statePartner)} <span className="text-[10px]">({item.state_partner_pct}%)</span></td>
                    <td className="px-3 py-3 text-right font-mono">{formatINRCompact(grossProfit)}</td>
                    {canEditModel && (
                      <td className="px-3 py-3 text-center">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditItem(item)}
                          title="Edit pricing & ROI"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={13} className="px-3 py-12 text-center text-muted-foreground">
                    No model items yet.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-card/60 text-sm font-semibold">
              <tr className="border-t border-border/60">
                <td colSpan={8} className="px-3 py-3 text-right uppercase tracking-wider text-[11px] text-muted-foreground">Totals</td>
                <td className="px-3 py-3 text-right font-mono">{formatINRCompact(totals.revenue)}</td>
                <td className="px-3 py-3 text-right font-mono text-emerald-500">{formatINRCompact(totals.mma)}</td>
                <td className="px-3 py-3 text-right font-mono text-gold">{formatINRCompact(totals.franchisee)}</td>
                <td className="px-3 py-3 text-right font-mono text-muted-foreground">{formatINRCompact(totals.state)}</td>
                <td className="px-3 py-3 text-right font-mono">{formatINRCompact(totals.gross)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
