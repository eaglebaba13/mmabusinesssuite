import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Trash2, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, formatINRCompact } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

type Product = {
  id: string;
  name: string;
  investment_amount: number;
  royalty_percent: number;
  revenue_share_percent: number;
  minimum_guarantee: number;
  expected_roi_percent: number | null;
  roi_timeline_months: number | null;
  gst_percent: number;
  profit_margin_percent: number | null;
};

type Inputs = {
  investment: number;
  monthly_revenue: number;
  months: number;
  growth_pct: number;
  opex_pct: number;
};

type MonthRow = {
  month: number;
  revenue: number;
  royalty: number;
  revenue_share: number;
  opex: number;
  gross_profit: number;
  net_to_franchisee: number;
  cumulative: number;
};

function compute(inputs: Inputs, p: Product): {
  rows: MonthRow[];
  break_even_month: number | null;
  total_net: number;
  total_revenue: number;
  mg_monthly: number;
} {
  const rows: MonthRow[] = [];
  let cumulative = -inputs.investment;
  let break_even_month: number | null = null;
  const mg_monthly = (p.minimum_guarantee ?? 0) / 12;

  for (let m = 1; m <= inputs.months; m++) {
    const growth = Math.pow(1 + inputs.growth_pct / 100, m - 1);
    const revenue = inputs.monthly_revenue * growth;
    const royalty = (revenue * p.royalty_percent) / 100;
    const revenue_share = (revenue * p.revenue_share_percent) / 100;
    const opex = (revenue * inputs.opex_pct) / 100;
    const gross_profit = revenue - opex;
    let net = gross_profit - royalty - revenue_share;
    if (net < mg_monthly) net = mg_monthly;
    cumulative += net;
    if (break_even_month === null && cumulative >= 0) break_even_month = m;
    rows.push({
      month: m,
      revenue,
      royalty,
      revenue_share,
      opex,
      gross_profit,
      net_to_franchisee: net,
      cumulative,
    });
  }
  const total_net = rows.reduce((s, r) => s + r.net_to_franchisee, 0);
  const total_revenue = rows.reduce((s, r) => s + r.revenue, 0);
  return { rows, break_even_month, total_net, total_revenue, mg_monthly };
}

export function RoiCalculator({ product }: { product: Product }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [inputs, setInputs] = React.useState<Inputs>({
    investment: Number(product.investment_amount) || 0,
    monthly_revenue: Math.round((Number(product.investment_amount) || 0) / 12) || 100000,
    months: product.roi_timeline_months || 36,
    growth_pct: 3,
    opex_pct: Math.max(0, 100 - (product.profit_margin_percent ?? 40)),
  });
  const [scenarioName, setScenarioName] = React.useState("");

  const result = React.useMemo(() => compute(inputs, product), [inputs, product]);
  const chartData = result.rows.map((r) => ({
    month: `M${r.month}`,
    Revenue: Math.round(r.revenue),
    "Net to Franchisee": Math.round(r.net_to_franchisee),
    Cumulative: Math.round(r.cumulative),
  }));

  const { data: scenarios = [] } = useQuery({
    queryKey: ["roi-scenarios", product.id, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_roi_scenarios")
        .select("*")
        .eq("product_id", product.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; inputs: Inputs; outputs: any; created_at: string }>;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Sign in required");
      if (!scenarioName.trim()) throw new Error("Give the scenario a name");
      const { error } = await (supabase as any).from("franchise_roi_scenarios").insert({
        user_id: user.id,
        product_id: product.id,
        name: scenarioName.trim(),
        inputs,
        outputs: {
          break_even_month: result.break_even_month,
          total_net: result.total_net,
          total_revenue: result.total_revenue,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scenario saved");
      setScenarioName("");
      qc.invalidateQueries({ queryKey: ["roi-scenarios", product.id, user?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("franchise_roi_scenarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scenario deleted");
      qc.invalidateQueries({ queryKey: ["roi-scenarios", product.id, user?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-display text-xl">ROI Calculator</h3>
          <Badge variant="outline" className="ml-2">{product.name}</Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <NumField label="Investment (₹)" value={inputs.investment} onChange={(v) => setInputs({ ...inputs, investment: v })} />
          <NumField label="Monthly revenue (₹)" value={inputs.monthly_revenue} onChange={(v) => setInputs({ ...inputs, monthly_revenue: v })} />
          <NumField label="Months to project" value={inputs.months} onChange={(v) => setInputs({ ...inputs, months: Math.min(120, Math.max(1, Math.round(v))) })} />
          <NumField label="Monthly growth %" value={inputs.growth_pct} step={0.1} onChange={(v) => setInputs({ ...inputs, growth_pct: v })} />
          <NumField label="Operating cost %" value={inputs.opex_pct} step={0.5} onChange={(v) => setInputs({ ...inputs, opex_pct: v })} />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <Kpi label="Break-even" value={result.break_even_month ? `Month ${result.break_even_month}` : "Not reached"} />
          <Kpi label={`Total net (${inputs.months}m)`} value={formatINRCompact(result.total_net)} />
          <Kpi label="Total revenue" value={formatINRCompact(result.total_revenue)} />
          <Kpi label="MG (monthly)" value={formatINR(result.mg_monthly)} />
        </div>

        <div className="mt-6 h-72 w-full">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatINRCompact(Number(v))} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v: any) => formatINR(Number(v))}
              />
              <Legend />
              <Line type="monotone" dataKey="Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Net to Franchisee" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Cumulative" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Scenario name</Label>
            <Input
              className="mt-1"
              placeholder="e.g. Conservative, Best case…"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
            />
          </div>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="bg-gradient-gold text-background"
          >
            <Save className="mr-2 h-4 w-4" />
            {save.isPending ? "Saving…" : "Save scenario"}
          </Button>
        </div>

        {scenarios.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Saved scenarios</p>
            {scenarios.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 p-3 text-sm">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.inputs?.months}m · rev {formatINRCompact(s.inputs?.monthly_revenue ?? 0)} · net {formatINRCompact(s.outputs?.total_net ?? 0)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setInputs(s.inputs)}>
                    Load
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(s.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        className="mt-1"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg">{value}</div>
    </div>
  );
}
