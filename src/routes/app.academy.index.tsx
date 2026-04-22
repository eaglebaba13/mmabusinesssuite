import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Users2, CalendarDays, Wallet, Award, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/app/KpiCard";
import { formatINRCompact } from "@/lib/format";

export const Route = createFileRoute("/app/academy/")({
  head: () => ({ meta: [{ title: "Academy Overview — MMA Suite" }] }),
  component: AcademyOverview,
});

function AcademyOverview() {
  const stats = useQuery({
    queryKey: ["academy-overview"],
    queryFn: async () => {
      const [c, b, s, e, f, cert] = await Promise.all([
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("batches").select("id, status"),
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("enrollments").select("id, status, total_fee"),
        supabase.from("fee_payments").select("amount, status"),
        supabase.from("certificates").select("id", { count: "exact", head: true }),
      ]);

      const enrollments = e.data ?? [];
      const fees = f.data ?? [];
      const batches = b.data ?? [];

      const collected = fees.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
      const pending = fees.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.amount), 0);
      const ongoing = batches.filter((x) => x.status === "ongoing").length;
      const upcoming = batches.filter((x) => x.status === "upcoming").length;
      const active = enrollments.filter((x) => x.status === "active").length;
      const completed = enrollments.filter((x) => x.status === "completed").length;

      return {
        courses: c.count ?? 0,
        students: s.count ?? 0,
        certs: cert.count ?? 0,
        ongoing,
        upcoming,
        active,
        completed,
        collected,
        pending,
      };
    },
  });

  const d = stats.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Academy at a glance</h2>
        <p className="text-sm text-muted-foreground">Live snapshot of every batch, student and rupee.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Courses" value={String(d?.courses ?? 0)} icon={BookOpen} hint="catalog" />
        <KpiCard label="Active Students" value={String(d?.active ?? 0)} icon={Users2} hint={`${d?.students ?? 0} total`} />
        <KpiCard label="Ongoing Batches" value={String(d?.ongoing ?? 0)} icon={CalendarDays} hint={`${d?.upcoming ?? 0} upcoming`} delay={0.05} />
        <KpiCard label="Certificates Issued" value={String(d?.certs ?? 0)} icon={Award} hint={`${d?.completed ?? 0} completions`} delay={0.1} />
        <KpiCard label="Fees Collected" value={formatINRCompact(d?.collected)} icon={Wallet} delay={0.15} />
        <KpiCard label="Fees Pending" value={formatINRCompact(d?.pending)} icon={Wallet} delay={0.2} />
        <KpiCard label="Enrollment Rate" value={`${d?.active && d?.students ? Math.round((d.active / d.students) * 100) : 0}%`} icon={GraduationCap} delay={0.25} />
        <KpiCard label="Completion Rate" value={`${d?.completed && (d?.completed + (d?.active ?? 0)) ? Math.round((d.completed / (d.completed + (d?.active ?? 0))) * 100) : 0}%`} icon={Award} delay={0.3} />
      </div>
    </div>
  );
}
