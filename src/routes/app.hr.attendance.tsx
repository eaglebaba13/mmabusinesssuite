import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, Calendar as CalIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportBar } from "@/components/app/ExportBar";
import { exportToCSV, exportToPDF } from "@/lib/export";

export const Route = createFileRoute("/app/hr/attendance")({
  component: AttendancePage,
});

const STATUSES = ["present", "absent", "half_day", "leave", "weekoff", "holiday"] as const;

const STATUS_BADGE: Record<string, string> = {
  present: "border-emerald-400/40 text-emerald-400",
  absent: "border-rose-400/40 text-rose-400",
  half_day: "border-amber-400/40 text-amber-400",
  leave: "border-violet-400/40 text-violet-400",
  weekoff: "border-slate-400/40 text-slate-400",
  holiday: "border-sky-400/40 text-sky-400",
};

function AttendancePage() {
  const qc = useQueryClient();
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));

  const employees = useQuery({
    queryKey: ["hr-employees-att"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, employee_code, full_name, designation, departments(name)")
        .neq("status", "terminated")
        .neq("status", "resigned")
        .order("full_name");
      return data ?? [];
    },
  });

  const attendance = useQuery({
    queryKey: ["hr-attendance", date],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_attendance")
        .select("*")
        .eq("attendance_date", date);
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ employeeId, status }: { employeeId: string; status: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const existing = (attendance.data ?? []).find((a) => a.employee_id === employeeId);
      if (existing) {
        const { error } = await supabase
          .from("employee_attendance")
          .update({ status: status as any, marked_by: u.user?.id })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employee_attendance").insert({
          employee_id: employeeId,
          attendance_date: date,
          status: status as any,
          marked_by: u.user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-attendance"] });
      qc.invalidateQueries({ queryKey: ["hr-overview"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const markAllPresent = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const existingMap = new Map((attendance.data ?? []).map((a) => [a.employee_id, a]));
      const toInsert: any[] = [];
      const toUpdate: { id: string }[] = [];
      (employees.data ?? []).forEach((e: any) => {
        const x = existingMap.get(e.id);
        if (x) toUpdate.push({ id: x.id });
        else toInsert.push({ employee_id: e.id, attendance_date: date, status: "present", marked_by: u.user?.id });
      });
      if (toInsert.length) {
        const { error } = await supabase.from("employee_attendance").insert(toInsert);
        if (error) throw error;
      }
      for (const row of toUpdate) {
        await supabase.from("employee_attendance").update({ status: "present" }).eq("id", row.id);
      }
    },
    onSuccess: () => {
      toast.success("Marked all present");
      qc.invalidateQueries({ queryKey: ["hr-attendance"] });
      qc.invalidateQueries({ queryKey: ["hr-overview"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = (employees.data ?? []).map((e: any) => {
    const a = (attendance.data ?? []).find((x) => x.employee_id === e.id);
    return { ...e, status: a?.status ?? "—" };
  });

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = (attendance.data ?? []).filter((a) => a.status === s).length;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/30 p-3 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Badge key={s} variant="outline" className={STATUS_BADGE[s]}>
              {s.replace("_", " ")}: {counts[s] ?? 0}
            </Badge>
          ))}
        </div>
        <Button onClick={() => markAllPresent.mutate()} disabled={markAllPresent.isPending} className="bg-gradient-gold text-background">
          <CheckCircle2 className="mr-1 h-4 w-4" />Mark all present
        </Button>
      </div>

      <ExportBar
        from=""
        to=""
        onFromChange={() => {}}
        onToChange={() => {}}
        showDateRange={false}
        count={rows.length}
        onCSV={() => exportToCSV(`attendance-${date}`, rows.map((r: any) => ({
          code: r.employee_code, name: r.full_name, dept: r.departments?.name ?? "", date, status: r.status,
        })), [
          { header: "Code", accessor: (r: any) => r.code },
          { header: "Name", accessor: (r: any) => r.name },
          { header: "Department", accessor: (r: any) => r.dept },
          { header: "Date", accessor: (r: any) => r.date },
          { header: "Status", accessor: (r: any) => r.status },
        ])}
        onPDF={() => exportToPDF({ filename: `attendance-${date}`, title: `Attendance ${date}`, rows: rows.map((r: any) => ({
          code: r.employee_code, name: r.full_name, dept: r.departments?.name ?? "", date, status: r.status,
        })), columns: [
          { header: "Code", accessor: (r: any) => r.code },
          { header: "Name", accessor: (r: any) => r.name },
          { header: "Department", accessor: (r: any) => r.dept },
          { header: "Date", accessor: (r: any) => r.date },
          { header: "Status", accessor: (r: any) => r.status },
        ] })}
      />

      <div className="rounded-2xl glass overflow-hidden">
        {employees.isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No employees yet.</div>
        ) : (
          <div className="divide-y divide-border/40">
            {rows.map((r: any) => (
              <div key={r.id} className="flex items-center gap-4 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.employee_code} · {r.departments?.name ?? "—"}</p>
                </div>
                <Select value={r.status === "—" ? "" : r.status} onValueChange={(v) => setStatus.mutate({ employeeId: r.id, status: v })}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Mark…" /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
                {r.status !== "—" && (
                  <Badge variant="outline" className={STATUS_BADGE[r.status]}>{r.status.replace("_", " ")}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
