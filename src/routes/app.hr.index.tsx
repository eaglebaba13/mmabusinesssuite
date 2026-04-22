import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, CalendarCheck, Plane, Banknote, Building2 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/app/KpiCard";
import { Badge } from "@/components/ui/badge";
import { formatINRCompact } from "@/lib/format";

export const Route = createFileRoute("/app/hr/")({
  component: HrOverview,
});

const STATUS_COLORS: Record<string, string> = {
  present: "#34d399",
  absent: "#f87171",
  half_day: "#fbbf24",
  leave: "#a78bfa",
  weekoff: "#94a3b8",
  holiday: "#60a5fa",
};

function HrOverview() {
  const stats = useQuery({
    queryKey: ["hr-overview"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const since = new Date();
      since.setDate(since.getDate() - 13);
      const sinceStr = since.toISOString().slice(0, 10);

      const [emp, dept, todayAtt, recentAtt, leave] = await Promise.all([
        supabase.from("employees").select("id, status, monthly_ctc, department_id, employment_type"),
        supabase.from("departments").select("id, name, code"),
        supabase.from("employee_attendance").select("status").eq("attendance_date", today),
        supabase.from("employee_attendance").select("attendance_date, status").gte("attendance_date", sinceStr),
        supabase.from("leave_requests").select("status, days, leave_type"),
      ]);

      const employees = emp.data ?? [];
      const active = employees.filter((e) => e.status === "active").length;
      const onLeave = employees.filter((e) => e.status === "on_leave").length;
      const totalCtc = employees.reduce((s, e) => s + Number(e.monthly_ctc ?? 0), 0);

      const todayCounts: Record<string, number> = {};
      (todayAtt.data ?? []).forEach((a) => { todayCounts[a.status] = (todayCounts[a.status] ?? 0) + 1; });
      const presentToday = todayCounts.present ?? 0;
      const absentToday = todayCounts.absent ?? 0;

      // Attendance trend (last 14 days)
      const trend: Record<string, { date: string; present: number; absent: number; leave: number }> = {};
      (recentAtt.data ?? []).forEach((a) => {
        const k = a.attendance_date;
        if (!trend[k]) trend[k] = { date: k.slice(5), present: 0, absent: 0, leave: 0 };
        if (a.status === "present" || a.status === "half_day") trend[k].present += 1;
        else if (a.status === "absent") trend[k].absent += 1;
        else if (a.status === "leave") trend[k].leave += 1;
      });
      const trendData = Object.values(trend).sort((a, b) => a.date.localeCompare(b.date));

      // Department headcount
      const deptCount: Record<string, number> = {};
      employees.forEach((e) => {
        const id = e.department_id ?? "unassigned";
        deptCount[id] = (deptCount[id] ?? 0) + 1;
      });
      const departmentData = (dept.data ?? []).map((d) => ({
        name: d.code,
        value: deptCount[d.id] ?? 0,
      })).filter((d) => d.value > 0);

      const leaves = leave.data ?? [];
      const pendingLeave = leaves.filter((l) => l.status === "pending").length;

      return {
        totalEmployees: employees.length,
        active,
        onLeave,
        totalCtc,
        presentToday,
        absentToday,
        pendingLeave,
        trendData,
        departmentData,
      };
    },
  });

  const recentLeaves = useQuery({
    queryKey: ["hr-recent-leaves"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_requests")
        .select("id, leave_type, from_date, to_date, days, status, employees(full_name, employee_code)")
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  const d = stats.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Employees" value={String(d?.totalEmployees ?? 0)} icon={Users} hint={`${d?.active ?? 0} active`} delay={0} />
        <KpiCard label="Present Today" value={String(d?.presentToday ?? 0)} icon={CalendarCheck} hint={`${d?.absentToday ?? 0} absent`} delay={0.05} />
        <KpiCard label="Pending Leave" value={String(d?.pendingLeave ?? 0)} icon={Plane} hint="Awaiting approval" delay={0.1} />
        <KpiCard label="Monthly Payroll" value={formatINRCompact(d?.totalCtc)} icon={Banknote} hint="Total CTC / month" delay={0.15} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl glass p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg">Attendance · last 14 days</h3>
            <Badge variant="outline" className="border-gold/40 text-gold">{d?.trendData?.length ?? 0} days</Badge>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d?.trendData ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
              <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="present" stackId="a" fill="#34d399" name="Present" radius={[0, 0, 0, 0]} />
              <Bar dataKey="leave" stackId="a" fill="#a78bfa" name="Leave" />
              <Bar dataKey="absent" stackId="a" fill="#f87171" name="Absent" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl glass p-5">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gold" />
            <h3 className="font-display text-lg">Department Mix</h3>
          </div>
          {(d?.departmentData?.length ?? 0) === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={d?.departmentData ?? []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {(d?.departmentData ?? []).map((_, i) => (
                    <Cell key={i} fill={["#c9a84c", "#f0d78c", "#a78bfa", "#34d399", "#60a5fa", "#fbbf24"][i % 6]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-2xl glass p-5">
        <h3 className="mb-4 font-display text-lg">Recent leave requests</h3>
        {(recentLeaves.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No leave requests yet.</p>
        ) : (
          <div className="divide-y divide-border/40">
            {recentLeaves.data!.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{l.employees?.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.leave_type} · {l.from_date} → {l.to_date} · {l.days}d
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    l.status === "approved" ? "border-emerald-400/40 text-emerald-400"
                    : l.status === "rejected" ? "border-rose-400/40 text-rose-400"
                    : "border-amber-400/40 text-amber-400"
                  }
                >
                  {l.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
