import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfDay } from "date-fns";
import { Users, CheckCircle2, Sparkles, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, LineChart } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/app/KpiCard";

export const Route = createFileRoute("/app/webinars/analytics")({
  head: () => ({ meta: [{ title: "Webinar Analytics — MMA Suite" }] }),
  component: WebinarAnalytics,
});

function WebinarAnalytics() {
  const regs = useQuery({
    queryKey: ["webinar-regs-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("webinar_registrations")
        .select("id, attended, registered_at, webinar_id, leads(stage), webinars(title, status)")
        .order("registered_at", { ascending: false })
        .limit(2000);
      return data ?? [];
    },
  });

  const list = regs.data ?? [];
  const total = list.length;
  const attended = list.filter((r: any) => r.attended).length;
  const converted = list.filter((r: any) => r.leads && !["new", "lost"].includes(r.leads.stage)).length;
  const attendanceRate = total ? Math.round((attended / total) * 100) : 0;

  const last30 = React.useMemo(() => {
    const days: { date: string; label: string; registered: number; attended: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      days.push({ date: d.toISOString().slice(0, 10), label: format(d, "dd MMM"), registered: 0, attended: 0 });
    }
    list.forEach((r: any) => {
      const d = r.registered_at?.slice(0, 10);
      const bucket = days.find((x) => x.date === d);
      if (bucket) {
        bucket.registered += 1;
        if (r.attended) bucket.attended += 1;
      }
    });
    return days;
  }, [list]);

  const byWebinar = React.useMemo(() => {
    const map = new Map<string, { title: string; registered: number; attended: number; converted: number }>();
    list.forEach((r: any) => {
      const id = r.webinar_id;
      const title = r.webinars?.title ?? "—";
      if (!map.has(id)) map.set(id, { title, registered: 0, attended: 0, converted: 0 });
      const m = map.get(id)!;
      m.registered += 1;
      if (r.attended) m.attended += 1;
      if (r.leads && !["new", "lost"].includes(r.leads.stage)) m.converted += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.registered - a.registered).slice(0, 8);
  }, [list]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl">Funnel Analytics</h2>
        <p className="text-sm text-muted-foreground">Registered → Attended → Converted across all campaigns.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Registrations" value={String(total)} icon={Users} />
        <KpiCard label="Attended" value={`${attended} · ${attendanceRate}%`} icon={CheckCircle2} delay={0.05} />
        <KpiCard label="Converted" value={String(converted)} icon={Sparkles} delay={0.1} />
        <KpiCard label="Conv. rate" value={`${attended ? Math.round((converted / attended) * 100) : 0}%`} icon={TrendingUp} delay={0.15} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Registrations · last 30 days</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={last30}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Line type="monotone" dataKey="registered" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="attended" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="glass p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top campaigns</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byWebinar} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="title" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={140} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Bar dataKey="registered" fill="hsl(var(--primary))" />
                <Bar dataKey="attended" fill="#10b981" />
                <Bar dataKey="converted" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
