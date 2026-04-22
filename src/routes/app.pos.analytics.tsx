import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { IndianRupee, ShoppingBag, Receipt, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/app/KpiCard";
import { formatINR, formatINRCompact } from "@/lib/format";

export const Route = createFileRoute("/app/pos/analytics")({
  component: PosAnalytics,
});

const COLORS = ["#c9a84c", "#7dd3fc", "#86efac", "#fca5a5", "#c4b5fd", "#fcd34d"];

function PosAnalytics() {
  const orders = useQuery({
    queryKey: ["pos-analytics-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_orders")
        .select("created_at, grand_total, gst_total, status, payment_status")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(2000);
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["pos-analytics-items"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_order_items")
        .select("product_name, quantity, line_total, sales_orders!inner(status)")
        .eq("sales_orders.status", "completed")
        .limit(2000);
      return data ?? [];
    },
  });

  const data = orders.data ?? [];

  const totalRevenue = data.reduce((s, o: any) => s + Number(o.grand_total ?? 0), 0);
  const totalGst = data.reduce((s, o: any) => s + Number(o.gst_total ?? 0), 0);
  const totalOrders = data.length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Last 14 days revenue
  const dayMap = new Map<string, number>();
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dayMap.set(d.toISOString().slice(0, 10), 0);
  }
  data.forEach((o: any) => {
    const d = String(o.created_at).slice(0, 10);
    if (dayMap.has(d)) dayMap.set(d, (dayMap.get(d) ?? 0) + Number(o.grand_total ?? 0));
  });
  const dailyRevenue = Array.from(dayMap.entries()).map(([d, v]) => ({
    day: d.slice(5),
    revenue: Math.round(v),
  }));

  // Top products
  const productMap = new Map<string, { qty: number; revenue: number }>();
  (items.data ?? []).forEach((it: any) => {
    const cur = productMap.get(it.product_name) ?? { qty: 0, revenue: 0 };
    cur.qty += Number(it.quantity ?? 0);
    cur.revenue += Number(it.line_total ?? 0);
    productMap.set(it.product_name, cur);
  });
  const topProducts = Array.from(productMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  // Payment status mix
  const allOrdersByPay = useQuery({
    queryKey: ["pos-analytics-paymix"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_orders").select("payment_status").limit(2000);
      return data ?? [];
    },
  });
  const payMap: Record<string, number> = {};
  (allOrdersByPay.data ?? []).forEach((o: any) => {
    payMap[o.payment_status] = (payMap[o.payment_status] ?? 0) + 1;
  });
  const payData = Object.entries(payMap).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Revenue" value={formatINRCompact(totalRevenue)} icon={IndianRupee} delay={0} />
        <KpiCard label="Orders" value={String(totalOrders)} icon={ShoppingBag} delay={0.05} />
        <KpiCard label="GST Collected" value={formatINRCompact(totalGst)} icon={Receipt} delay={0.1} />
        <KpiCard label="Avg Ticket" value={formatINRCompact(avgTicket)} icon={TrendingUp} delay={0.15} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl glass p-4 lg:col-span-2">
          <h3 className="mb-3 font-display text-lg">Revenue · last 14 days</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatINRCompact(v)} />
                <Tooltip
                  formatter={(v: any) => formatINR(Number(v))}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
                <Bar dataKey="revenue" fill="#c9a84c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl glass p-4">
          <h3 className="mb-3 font-display text-lg">Payment status mix</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={payData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {payData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-2xl glass p-4">
        <h3 className="mb-3 font-display text-lg">Top products by revenue</h3>
        {topProducts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No completed sales yet.</p>
        ) : (
          <div className="divide-y divide-border/40">
            {topProducts.map((p, idx) => (
              <div key={p.name} className="grid grid-cols-12 items-center gap-2 py-2 text-sm">
                <div className="col-span-1 font-mono text-muted-foreground">#{idx + 1}</div>
                <div className="col-span-6 truncate font-medium">{p.name}</div>
                <div className="col-span-2 text-right text-muted-foreground">{p.qty} sold</div>
                <div className="col-span-3 text-right font-semibold text-gold">
                  {formatINR(p.revenue)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
