import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, Building2, Coins, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatINR, formatINRCompact } from "@/lib/format";
import { format, differenceInDays, parseISO, startOfMonth } from "date-fns";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export function ProductPerformance({ productId }: { productId: string }) {
  const { data: leads = [] } = useQuery({
    queryKey: ["perf-leads", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, interest_stage, created_at")
        .eq("franchise_product_id", productId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: franchisees = [] } = useQuery({
    queryKey: ["perf-franchisees", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("franchisees")
        .select("id, full_name, investment_amount, joined_at, status")
        .eq("franchise_product_id", productId)
        .order("joined_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalLeads = leads.length;
  const wonLeads = leads.filter((l: any) => l.interest_stage === "won").length;
  const shortlisted = leads.filter((l: any) => l.interest_stage === "shortlisted").length;
  const activeFranchisees = franchisees.filter((f: any) => f.status === "active").length;
  const totalInvested = franchisees.reduce((s: number, f: any) => s + Number(f.investment_amount ?? 0), 0);
  const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  // Median time-to-conversion (lead created → franchisee joined) — best-effort by name/email is expensive;
  // instead use joined_at spread as a proxy for signup velocity.
  const days = franchisees
    .map((f: any) => {
      const l = leads.find((x: any) => x.interest_stage === "won");
      if (!l) return null;
      return differenceInDays(parseISO(f.joined_at), parseISO(l.created_at));
    })
    .filter((n): n is number => n != null && n >= 0);
  const medianDays = days.length ? [...days].sort((a, b) => a - b)[Math.floor(days.length / 2)] : null;

  // Monthly signups chart from franchisees.joined_at
  const chart = React.useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const f of franchisees) {
      const key = format(startOfMonth(parseISO(f.joined_at)), "MMM yy");
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    return Array.from(byMonth.entries())
      .map(([month, count]) => ({ month, count }))
      .reverse();
  }, [franchisees]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Leads generated" value={String(totalLeads)} icon={Users} />
        <Stat label="Shortlisted" value={String(shortlisted)} icon={TrendingUp} />
        <Stat label="Conversion rate" value={`${conversionRate}%`} icon={Percent} />
        <Stat label="Active franchisees" value={String(activeFranchisees)} icon={Building2} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Total invested" value={formatINRCompact(totalInvested)} icon={Coins} />
        <Stat
          label="Avg investment"
          value={franchisees.length ? formatINRCompact(totalInvested / franchisees.length) : "—"}
          icon={Coins}
        />
        <Stat
          label="Median time-to-signup"
          value={medianDays != null ? `${medianDays}d` : "—"}
          icon={TrendingUp}
        />
      </div>

      <Card className="p-6">
        <h3 className="mb-4 font-display text-lg">Monthly signups</h3>
        {chart.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No signups yet.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 font-display text-lg">Franchisees on this product</h3>
        {franchisees.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No franchisees yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Franchisee</th>
                  <th className="py-2 pr-4">Investment</th>
                  <th className="py-2 pr-4">Joined</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {franchisees.map((f: any) => (
                  <tr key={f.id} className="border-b border-border/30 last:border-0">
                    <td className="py-2 pr-4 font-medium">{f.full_name}</td>
                    <td className="py-2 pr-4">{formatINR(Number(f.investment_amount ?? 0))}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {format(parseISO(f.joined_at), "dd MMM yyyy")}
                    </td>
                    <td className="py-2 capitalize">{f.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary/70" />
      </div>
      <p className="mt-1 font-display text-2xl">{value}</p>
    </Card>
  );
}
