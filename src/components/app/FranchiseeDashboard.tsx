import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import {
  TrendingUp,
  Wallet,
  ShoppingCart,
  Receipt,
  Users,
  Package,
  Clock,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/app/KpiCard";
import { formatINRCompact, formatINR } from "@/lib/format";

interface Props {
  franchiseeId: string;
  franchiseeName: string;
  investment: number;
  joinedAt?: string | null;
  status?: string | null;
}

export function FranchiseeDashboard({
  franchiseeId,
  franchiseeName,
  investment,
  joinedAt,
  status,
}: Props) {
  const since = React.useMemo(() => subMonths(new Date(), 5), []);
  const sinceISO = since.toISOString();
  const since6mStart = startOfMonth(since).toISOString().slice(0, 10);

  // Revenue entries (academy fees, dark store, etc. attributed to franchisee)
  const { data: revenue = [] } = useQuery({
    queryKey: ["fr-dash-revenue", franchiseeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("revenue_entries")
        .select("amount, received_on, source")
        .eq("franchisee_id", franchiseeId)
        .gte("received_on", since6mStart)
        .order("received_on", { ascending: true });
      return data ?? [];
    },
  });

  // POS / sales orders for this franchisee
  const { data: orders = [] } = useQuery({
    queryKey: ["fr-dash-orders", franchiseeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_orders")
        .select("id, grand_total, status, payment_status, created_at, customer_name, invoice_number")
        .eq("franchisee_id", franchiseeId)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  // Expenses booked against this franchisee
  const { data: expenses = [] } = useQuery({
    queryKey: ["fr-dash-expenses", franchiseeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("expenses")
        .select("amount, expense_date, vendor, description")
        .eq("franchisee_id", franchiseeId)
        .gte("expense_date", since6mStart)
        .order("expense_date", { ascending: false });
      return data ?? [];
    },
  });

  // ROI payouts
  const { data: payouts = [] } = useQuery({
    queryKey: ["fr-dash-payouts", franchiseeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("roi_payouts")
        .select("*")
        .eq("franchisee_id", franchiseeId)
        .order("payout_month", { ascending: false });
      return data ?? [];
    },
  });

  // Aggregate metrics
  const totalRevenue = revenue.reduce((s, r) => s + Number(r.amount), 0);
  const completedOrders = orders.filter((o) => o.status === "completed");
  const grossSales = completedOrders.reduce((s, o) => s + Number(o.grand_total), 0);
  const pendingOrders = orders.filter((o) => o.status !== "completed" && o.status !== "void").length;
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const lifetimePaid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
  const pendingPayout = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.total_amount), 0);

  // Current month KPIs
  const monthStart = startOfMonth(new Date()).toISOString().slice(0, 10);
  const monthEnd = endOfMonth(new Date()).toISOString().slice(0, 10);
  const monthRevenue = revenue
    .filter((r) => r.received_on >= monthStart && r.received_on <= monthEnd)
    .reduce((s, r) => s + Number(r.amount), 0);
  const monthOrders = orders.filter((o) => {
    const d = o.created_at.slice(0, 10);
    return d >= monthStart && d <= monthEnd && o.status === "completed";
  });
  const monthGross = monthOrders.reduce((s, o) => s + Number(o.grand_total), 0);

  // ROI yield (lifetime paid / investment)
  const roiYieldPct = investment > 0 ? (lifetimePaid / investment) * 100 : 0;

  // Build 6-month series
  const months = React.useMemo(() => {
    const arr: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      arr.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM") });
    }
    return arr;
  }, []);

  const revenueSeries = months.map((m) => {
    const rev = revenue
      .filter((r) => r.received_on.startsWith(m.key))
      .reduce((s, r) => s + Number(r.amount), 0);
    const sales = orders
      .filter((o) => o.created_at.startsWith(m.key) && o.status === "completed")
      .reduce((s, o) => s + Number(o.grand_total), 0);
    const exp = expenses
      .filter((e) => e.expense_date.startsWith(m.key))
      .reduce((s, e) => s + Number(e.amount), 0);
    return { month: m.label, revenue: rev, sales, expenses: exp };
  });

  // Source breakdown for revenue
  const sourceBreakdown = React.useMemo(() => {
    const map = new Map<string, number>();
    revenue.forEach((r) => {
      const k = r.source ?? "other";
      map.set(k, (map.get(k) ?? 0) + Number(r.amount));
    });
    return Array.from(map.entries()).map(([source, amount]) => ({ source, amount }));
  }, [revenue]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl glass p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gold">Franchisee Dashboard</p>
            <h2 className="mt-1 font-display text-2xl">{franchiseeName}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {status && <Badge variant="outline" className="mr-2 border-gold/40 text-gold capitalize">{status}</Badge>}
              {joinedAt && <span>Joined {format(new Date(joinedAt), "MMM yyyy")}</span>}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">ROI yield</div>
            <div className="font-display text-3xl text-gradient-gold">{roiYieldPct.toFixed(1)}%</div>
            <div className="text-[10px] text-muted-foreground">on {formatINRCompact(investment)} invested</div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="This month revenue"
          value={formatINRCompact(monthRevenue + monthGross)}
          icon={TrendingUp}
          hint={`${monthOrders.length} orders`}
          delay={0}
        />
        <KpiCard
          label="Lifetime ROI paid"
          value={formatINRCompact(lifetimePaid)}
          icon={Wallet}
          hint={`${payouts.filter((p) => p.status === "paid").length} payouts`}
          delay={0.05}
        />
        <KpiCard
          label="Pending payouts"
          value={formatINRCompact(pendingPayout)}
          icon={Clock}
          hint={`${payouts.filter((p) => p.status === "pending").length} pending`}
          delay={0.1}
        />
        <KpiCard
          label="Total POS sales"
          value={formatINRCompact(grossSales)}
          icon={ShoppingCart}
          hint={`${completedOrders.length} completed`}
          delay={0.15}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl glass p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg">6-month performance</h3>
            <span className="text-xs text-muted-foreground">Revenue + POS sales vs expenses</span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c9a84c" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#c9a84c" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatINRCompact(v)} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => formatINR(v)}
                />
                <Area type="monotone" dataKey="revenue" stroke="#c9a84c" fill="url(#grRev)" strokeWidth={2} name="Revenue" />
                <Area type="monotone" dataKey="sales" stroke="#60a5fa" fill="url(#grSales)" strokeWidth={2} name="POS sales" />
                <Area type="monotone" dataKey="expenses" stroke="#f87171" fill="transparent" strokeWidth={2} strokeDasharray="4 4" name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl glass p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg">Revenue mix</h3>
            <Receipt className="h-4 w-4 text-gold" />
          </div>
          {sourceBreakdown.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
              No revenue recorded yet.
            </div>
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceBreakdown} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => formatINRCompact(v)} />
                  <YAxis type="category" dataKey="source" stroke="hsl(var(--muted-foreground))" fontSize={11} width={80} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number) => formatINR(v)}
                  />
                  <Bar dataKey="amount" fill="#c9a84c" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Activity summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Package className="h-3.5 w-3.5" /> Orders snapshot
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Total orders" value={String(orders.length)} />
            <Row label="Completed" value={String(completedOrders.length)} />
            <Row label="Pending / draft" value={String(pendingOrders)} />
            <Row label="This month" value={String(monthOrders.length)} accent />
          </div>
        </div>
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Money in
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Lifetime revenue" value={formatINRCompact(totalRevenue + grossSales)} />
            <Row label="Recurring revenue" value={formatINRCompact(totalRevenue)} />
            <Row label="POS gross" value={formatINRCompact(grossSales)} />
            <Row label="This month" value={formatINRCompact(monthRevenue + monthGross)} accent />
          </div>
        </div>
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Money out
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Total expenses" value={formatINRCompact(totalExpenses)} />
            <Row label="ROI paid out" value={formatINRCompact(lifetimePaid)} />
            <Row label="Pending payouts" value={formatINRCompact(pendingPayout)} />
            <Row
              label="Net (rev − exp − ROI)"
              value={formatINRCompact(totalRevenue + grossSales - totalExpenses - lifetimePaid)}
              accent
            />
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="rounded-2xl glass p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">Recent orders</h3>
          <span className="text-xs text-muted-foreground">{orders.length} total</span>
        </div>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Invoice</th>
                  <th className="px-2 py-2 text-left">Customer</th>
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-center">Status</th>
                  <th className="px-2 py-2 text-center">Payment</th>
                  <th className="px-2 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 12).map((o) => (
                  <tr key={o.id} className="border-b border-border/40">
                    <td className="px-2 py-2 font-mono text-xs">{o.invoice_number ?? o.id.slice(0, 8)}</td>
                    <td className="px-2 py-2">{o.customer_name ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{format(new Date(o.created_at), "dd MMM yy")}</td>
                    <td className="px-2 py-2 text-center">
                      <Badge
                        variant="outline"
                        className={
                          o.status === "completed"
                            ? "border-emerald-500/40 text-emerald-400 capitalize"
                            : "border-amber-500/40 text-amber-400 capitalize"
                        }
                      >
                        {o.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Badge
                        variant="outline"
                        className={
                          o.payment_status === "paid"
                            ? "border-emerald-500/40 text-emerald-400 capitalize"
                            : "border-rose-500/40 text-rose-400 capitalize"
                        }
                      >
                        {o.payment_status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-gold">
                      {formatINRCompact(Number(o.grand_total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ROI payouts */}
      <div className="rounded-2xl glass p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">ROI payouts</h3>
          <span className="text-xs text-muted-foreground">{payouts.length} total</span>
        </div>
        {payouts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No payouts yet.</p>
        ) : (
          <div className="space-y-2">
            {payouts.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-background/40 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{format(new Date(p.payout_month), "MMMM yyyy")}</div>
                  <div className="text-xs text-muted-foreground">
                    Base {formatINRCompact(Number(p.base_roi))} · Emporium {formatINRCompact(Number(p.emporium_incentive))} · Academy{" "}
                    {formatINRCompact(Number(p.academy_incentive))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={
                      p.status === "paid"
                        ? "border-emerald-500/40 text-emerald-400"
                        : "border-amber-500/40 text-amber-400"
                    }
                  >
                    {p.status === "paid" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                    {p.status}
                  </Badge>
                  <div className="font-display text-lg text-gold">{formatINRCompact(Number(p.total_amount))}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "font-display text-gold" : "font-medium"}>{value}</span>
    </div>
  );
}
