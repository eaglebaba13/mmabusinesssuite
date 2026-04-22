import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  IndianRupee,
  Users,
  Building2,
  TrendingUp,
  Target,
  Wallet,
  CalendarClock,
  Trophy,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/app/KpiCard";
import { formatINRCompact } from "@/lib/format";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Master Dashboard — MMA Suite" }] }),
  component: DashboardPage,
});

const PIE_COLORS = ["#c9a84c", "#f0d78c", "#9b7e2f", "#dcc270", "#7a6224", "#bca055"];

function DashboardPage() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [leads, franchisees, payouts, sourcesRes] = await Promise.all([
        supabase.from("leads").select("id, stage, created_at, budget"),
        supabase.from("franchisees").select("id, status, investment_amount"),
        supabase.from("roi_payouts").select("payout_month, total_amount, status"),
        supabase.from("leads").select("source"),
      ]);

      const leadList = leads.data ?? [];
      const fList = franchisees.data ?? [];
      const pList = payouts.data ?? [];
      const sList = sourcesRes.data ?? [];

      const totalRevenue =
        fList.reduce((s, f) => s + Number(f.investment_amount), 0) +
        pList.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
      const franchiseFees = fList.reduce((s, f) => s + Number(f.investment_amount), 0);
      const closingRatio =
        leadList.length === 0
          ? 0
          : (leadList.filter((l) => l.stage === "closed").length / leadList.length) * 100;
      const activeFranchisees = fList.filter((f) => f.status === "active").length;
      const pendingPayouts = pList.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.total_amount), 0);

      // monthly revenue last 6 months
      const monthBuckets: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toLocaleString("en", { month: "short" });
        monthBuckets[key] = 0;
      }
      pList.forEach((p) => {
        const d = new Date(p.payout_month);
        const key = d.toLocaleString("en", { month: "short" });
        if (key in monthBuckets) monthBuckets[key] += Number(p.total_amount);
      });
      const monthly = Object.entries(monthBuckets).map(([m, v]) => ({ month: m, revenue: v }));

      // sources
      const sourceMap: Record<string, number> = {};
      sList.forEach((s) => {
        sourceMap[s.source] = (sourceMap[s.source] ?? 0) + 1;
      });
      const sources = Object.entries(sourceMap).map(([name, value]) => ({ name, value }));

      // stage distribution for bar
      const stageMap: Record<string, number> = {};
      leadList.forEach((l) => {
        stageMap[l.stage] = (stageMap[l.stage] ?? 0) + 1;
      });
      const stages = Object.entries(stageMap).map(([stage, count]) => ({ stage, count }));

      return {
        totalRevenue,
        franchiseFees,
        totalLeads: leadList.length,
        closingRatio,
        activeFranchisees,
        pendingPayouts,
        netProfit: totalRevenue * 0.42,
        mrr: pList.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0) / 6,
        monthly,
        sources,
        stages,
      };
    },
  });

  const data = stats.data;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-8">
      {/* header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-xs uppercase tracking-[0.25em] text-gold">Master Dashboard</p>
        <h1 className="mt-1 font-display text-4xl">Empire at a glance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live revenue, leads, franchise health and payout pipeline.
        </p>
      </motion.div>

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Revenue" value={formatINRCompact(data?.totalRevenue)} delta={12.4} icon={IndianRupee} delay={0} hint="lifetime" />
        <KpiCard label="MRR (avg 6mo)" value={formatINRCompact(data?.mrr)} delta={8.2} icon={TrendingUp} delay={0.05} />
        <KpiCard label="Franchise Fees" value={formatINRCompact(data?.franchiseFees)} delta={5.6} icon={Building2} delay={0.1} />
        <KpiCard label="Net Profit" value={formatINRCompact(data?.netProfit)} delta={9.1} icon={Wallet} delay={0.15} hint="42% margin" />
        <KpiCard label="Total Leads" value={data?.totalLeads.toString() ?? "0"} delta={18.3} icon={Users} delay={0.2} />
        <KpiCard label="Closing Ratio" value={`${(data?.closingRatio ?? 0).toFixed(1)}%`} delta={2.1} icon={Target} delay={0.25} />
        <KpiCard label="Active Franchisees" value={(data?.activeFranchisees ?? 0).toString()} delta={6.7} icon={Trophy} delay={0.3} />
        <KpiCard label="Pending Payouts" value={formatINRCompact(data?.pendingPayouts)} delta={-3.2} icon={CalendarClock} delay={0.35} />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl glass p-6 lg:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg">Monthly revenue</h3>
              <p className="text-xs text-muted-foreground">Last 6 months · paid payouts</p>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.monthly ?? []}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c9a84c" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#c9a84c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#c9a84c22" />
                <XAxis dataKey="month" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => formatINRCompact(v)} />
                <ReTooltip
                  contentStyle={{ background: "#1a1a1a", border: "1px solid #c9a84c44", borderRadius: 8 }}
                  formatter={(v: number) => formatINRCompact(v)}
                />
                <Line type="monotone" dataKey="revenue" stroke="#c9a84c" strokeWidth={2.5} dot={{ fill: "#c9a84c", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="rounded-2xl glass p-6"
        >
          <h3 className="font-display text-lg">Lead sources</h3>
          <p className="text-xs text-muted-foreground">Acquisition mix</p>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.sources ?? []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                  {(data?.sources ?? []).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <ReTooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #c9a84c44", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {(data?.sources ?? []).map((s, i) => (
              <span key={s.name} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-muted-foreground capitalize">{s.name}</span>
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Pipeline distribution */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="rounded-2xl glass p-6"
      >
        <h3 className="font-display text-lg">Pipeline distribution</h3>
        <p className="text-xs text-muted-foreground">Leads across stages</p>
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.stages ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#c9a84c22" />
              <XAxis dataKey="stage" stroke="#888" fontSize={11} tickFormatter={(s) => String(s).replace("_", " ")} />
              <YAxis stroke="#888" fontSize={11} />
              <ReTooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #c9a84c44", borderRadius: 8 }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#c9a84c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}
