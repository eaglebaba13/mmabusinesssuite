import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Wallet, Coins, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/app/KpiCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatINRCompact } from "@/lib/format";

export const Route = createFileRoute("/app/finance/")({
  component: FinanceOverview,
});

type MonthBucket = { month: string; revenue: number; expense: number };

function FinanceOverview() {
  const stats = useQuery({
    queryKey: ["fin-overview"],
    queryFn: async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 5);
      since.setDate(1);
      const sinceStr = since.toISOString().slice(0, 10);

      const [rev, fees, exp, payouts] = await Promise.all([
        supabase.from("revenue_entries").select("amount, received_on, source").gte("received_on", sinceStr),
        supabase.from("fee_payments").select("amount, paid_on, status").eq("status", "paid").gte("paid_on", sinceStr),
        supabase.from("expenses").select("amount, expense_date, status").neq("status", "cancelled").gte("expense_date", sinceStr),
        supabase.from("roi_payouts").select("total_amount, status, payout_month"),
      ]);

      // Build monthly buckets (last 6 months including current)
      const buckets: MonthBucket[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        d.setDate(1);
        buckets.push({ month: d.toISOString().slice(0, 7), revenue: 0, expense: 0 });
      }
      const idx = (date: string) => buckets.findIndex((b) => b.month === date.slice(0, 7));

      (rev.data ?? []).forEach((r: any) => {
        const i = idx(r.received_on);
        if (i >= 0) buckets[i].revenue += Number(r.amount ?? 0);
      });
      (fees.data ?? []).forEach((f: any) => {
        if (!f.paid_on) return;
        const i = idx(f.paid_on);
        if (i >= 0) buckets[i].revenue += Number(f.amount ?? 0);
      });
      (exp.data ?? []).forEach((e: any) => {
        const i = idx(e.expense_date);
        if (i >= 0) buckets[i].expense += Number(e.amount ?? 0);
      });

      const totalRevenue = buckets.reduce((s, b) => s + b.revenue, 0);
      const totalExpense = buckets.reduce((s, b) => s + b.expense, 0);
      const netProfit = totalRevenue - totalExpense;
      const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      const current = buckets[buckets.length - 1];
      const prev = buckets[buckets.length - 2];
      const revGrowth = prev?.revenue ? ((current.revenue - prev.revenue) / prev.revenue) * 100 : 0;

      const pendingPayouts = (payouts.data ?? []).filter((p: any) => p.status === "pending");
      const pendingPayoutAmt = pendingPayouts.reduce((s: number, p: any) => s + Number(p.total_amount ?? 0), 0);

      return { buckets, totalRevenue, totalExpense, netProfit, margin, revGrowth, pendingPayouts: pendingPayouts.length, pendingPayoutAmt };
    },
  });

  const recent = useQuery({
    queryKey: ["fin-recent"],
    queryFn: async () => {
      const [revs, exps] = await Promise.all([
        supabase.from("revenue_entries").select("id, source, source_label, amount, received_on").order("received_on", { ascending: false }).limit(5),
        supabase.from("expenses").select("id, vendor, description, amount, expense_date, expense_categories(name)").order("expense_date", { ascending: false }).limit(5),
      ]);
      return { revs: revs.data ?? [], exps: exps.data ?? [] };
    },
  });

  const buckets = stats.data?.buckets ?? [];
  const maxBar = Math.max(1, ...buckets.map((b) => Math.max(b.revenue, b.expense)));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Revenue (6mo)" value={formatINRCompact(stats.data?.totalRevenue ?? 0)} icon={TrendingUp} delay={0} />
        <KpiCard label="Expenses (6mo)" value={formatINRCompact(stats.data?.totalExpense ?? 0)} icon={TrendingDown} delay={0.05} />
        <KpiCard label="Net Profit" value={formatINRCompact(stats.data?.netProfit ?? 0)} icon={Wallet} delay={0.1} />
        <KpiCard label="Margin" value={`${(stats.data?.margin ?? 0).toFixed(1)}%`} icon={ArrowUpRight} delay={0.15} />
        <KpiCard label="Revenue Growth (MoM)" value={`${(stats.data?.revGrowth ?? 0).toFixed(1)}%`} icon={ArrowUpRight} delay={0.2} />
        <KpiCard label="Pending ROI Payouts" value={String(stats.data?.pendingPayouts ?? 0)} icon={Coins} delay={0.25} />
        <KpiCard label="Pending Payout Value" value={formatINRCompact(stats.data?.pendingPayoutAmt ?? 0)} icon={Coins} delay={0.3} />
      </div>

      <Card className="glass p-5">
        <h2 className="mb-4 font-display text-lg">6-Month Cash Flow</h2>
        <div className="grid grid-cols-6 gap-3">
          {buckets.map((b) => {
            const revH = (b.revenue / maxBar) * 140;
            const expH = (b.expense / maxBar) * 140;
            const monthLabel = new Date(b.month + "-02").toLocaleString("en-IN", { month: "short" });
            return (
              <div key={b.month} className="flex flex-col items-center gap-2">
                <div className="flex h-[150px] w-full items-end gap-1">
                  <div
                    className="flex-1 rounded-t bg-gradient-to-t from-emerald-600/60 to-emerald-400"
                    style={{ height: `${revH}px` }}
                    title={`Revenue: ${formatINR(b.revenue)}`}
                  />
                  <div
                    className="flex-1 rounded-t bg-gradient-to-t from-red-700/60 to-red-500"
                    style={{ height: `${expH}px` }}
                    title={`Expense: ${formatINR(b.expense)}`}
                  />
                </div>
                <div className="text-xs font-medium text-muted-foreground">{monthLabel}</div>
                <div className="text-[10px] text-muted-foreground">{formatINRCompact(b.revenue - b.expense)}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Revenue</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-500" />Expenses</span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass p-5">
          <h3 className="mb-3 font-display text-base">Recent Revenue</h3>
          <div className="space-y-2">
            {recent.data?.revs.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3">
                <div>
                  <div className="text-sm font-medium">{r.source_label || r.source}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.received_on).toLocaleDateString("en-IN")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 capitalize">{r.source.replace("_", " ")}</Badge>
                  <span className="font-mono text-sm text-emerald-500">+{formatINR(r.amount)}</span>
                </div>
              </div>
            ))}
            {!recent.data?.revs.length && <p className="text-sm text-muted-foreground">No entries yet.</p>}
          </div>
        </Card>

        <Card className="glass p-5">
          <h3 className="mb-3 font-display text-base">Recent Expenses</h3>
          <div className="space-y-2">
            {recent.data?.exps.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3">
                <div>
                  <div className="text-sm font-medium">{e.vendor || e.description}</div>
                  <div className="text-xs text-muted-foreground">{e.expense_categories?.name} · {new Date(e.expense_date).toLocaleDateString("en-IN")}</div>
                </div>
                <span className="flex items-center gap-1 font-mono text-sm text-red-500">
                  <ArrowDownRight className="h-3 w-3" />
                  {formatINR(e.amount)}
                </span>
              </div>
            ))}
            {!recent.data?.exps.length && <p className="text-sm text-muted-foreground">No expenses yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
