import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, CheckCircle2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/app/KpiCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ExportBar } from "@/components/app/ExportBar";
import { exportToCSV, exportToPDF } from "@/lib/export";
import { formatINR, formatINRCompact } from "@/lib/format";

export const Route = createFileRoute("/app/hr/payroll")({
  component: PayrollPage,
});

const STATUS_COLOR: Record<string, string> = {
  draft: "border-slate-400/40 text-slate-400",
  processing: "border-amber-400/40 text-amber-400",
  paid: "border-emerald-400/40 text-emerald-400",
  cancelled: "border-rose-400/40 text-rose-400",
};

function firstOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function PayrollPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(firstOfMonth());
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);

  const runs = useQuery({
    queryKey: ["payroll-runs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_runs")
        .select("*")
        .order("payroll_month", { ascending: false });
      return data ?? [];
    },
  });

  React.useEffect(() => {
    if (!selectedRunId && runs.data && runs.data.length > 0) {
      setSelectedRunId(runs.data[0].id);
    }
  }, [runs.data, selectedRunId]);

  const items = useQuery({
    queryKey: ["payroll-items", selectedRunId],
    enabled: !!selectedRunId,
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_items")
        .select("*, employees(full_name, employee_code, departments(name))")
        .eq("payroll_run_id", selectedRunId!)
        .order("created_at");
      return data ?? [];
    },
  });

  const generateRun = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      // Check duplicate
      const { data: dup } = await supabase.from("payroll_runs").select("id").eq("payroll_month", month).maybeSingle();
      if (dup) throw new Error("Payroll already exists for this month");

      // Pull active employees
      const { data: emps, error: eErr } = await supabase
        .from("employees")
        .select("id, basic_salary, hra, allowances, monthly_ctc")
        .eq("status", "active");
      if (eErr) throw eErr;
      const employees = emps ?? [];

      // Compute days in month
      const ym = month.slice(0, 7);
      const monthStart = ym + "-01";
      const next = new Date(month); next.setMonth(next.getMonth() + 1);
      const monthEnd = next.toISOString().slice(0, 10);

      const { data: att } = await supabase
        .from("employee_attendance")
        .select("employee_id, status, attendance_date")
        .gte("attendance_date", monthStart)
        .lt("attendance_date", monthEnd);

      const counts: Record<string, { present: number; absent: number; paid: number }> = {};
      (att ?? []).forEach((a: any) => {
        if (!counts[a.employee_id]) counts[a.employee_id] = { present: 0, absent: 0, paid: 0 };
        const c = counts[a.employee_id];
        if (a.status === "present") { c.present += 1; c.paid += 1; }
        else if (a.status === "half_day") { c.present += 0.5; c.paid += 0.5; }
        else if (a.status === "absent") { c.absent += 1; }
        else if (["leave", "weekoff", "holiday"].includes(a.status)) { c.paid += 1; }
      });

      // Insert run
      const { data: run, error: rErr } = await supabase
        .from("payroll_runs")
        .insert({ payroll_month: month, status: "draft", processed_by: u.user?.id, employee_count: employees.length })
        .select("id")
        .single();
      if (rErr) throw rErr;

      let totalGross = 0, totalDed = 0, totalNet = 0;
      const rows = employees.map((e: any) => {
        const c = counts[e.id] ?? { present: 0, absent: 0, paid: 0 };
        const basic = Number(e.basic_salary ?? 0);
        const hra = Number(e.hra ?? 0);
        const allow = Number(e.allowances ?? 0);
        const gross = basic + hra + allow;
        const pf = Math.round(basic * 0.12);
        const tax = gross > 50000 ? Math.round(gross * 0.05) : 0;
        const totalDeductions = pf + tax;
        const net = gross - totalDeductions;
        totalGross += gross; totalDed += totalDeductions; totalNet += net;
        return {
          payroll_run_id: run.id,
          employee_id: e.id,
          basic_salary: basic,
          hra,
          allowances: allow,
          bonus: 0,
          gross_pay: gross,
          pf_deduction: pf,
          tax_deduction: tax,
          other_deductions: 0,
          total_deductions: totalDeductions,
          net_pay: net,
          days_present: c.present,
          days_absent: c.absent,
          paid_days: c.paid,
        };
      });
      if (rows.length) {
        const { error: iErr } = await supabase.from("payroll_items").insert(rows);
        if (iErr) throw iErr;
      }

      await supabase
        .from("payroll_runs")
        .update({ total_gross: totalGross, total_deductions: totalDed, total_net: totalNet })
        .eq("id", run.id);

      return run.id as string;
    },
    onSuccess: (id) => {
      toast.success("Payroll generated");
      setOpen(false);
      setSelectedRunId(id);
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "paid", processed_at: new Date().toISOString(), processed_by: u.user?.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as paid");
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedRun = (runs.data ?? []).find((r) => r.id === selectedRunId);

  const exportRows = (items.data ?? []).map((it: any) => ({
    code: it.employees?.employee_code,
    name: it.employees?.full_name,
    department: it.employees?.departments?.name ?? "",
    paid_days: it.paid_days,
    gross: it.gross_pay,
    pf: it.pf_deduction,
    tax: it.tax_deduction,
    deductions: it.total_deductions,
    net: it.net_pay,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Runs" value={String(runs.data?.length ?? 0)} icon={FileText} delay={0} />
        <KpiCard label="Selected Gross" value={formatINRCompact(Number(selectedRun?.total_gross ?? 0))} icon={Play} delay={0.05} />
        <KpiCard label="Selected Deductions" value={formatINRCompact(Number(selectedRun?.total_deductions ?? 0))} icon={Play} delay={0.1} />
        <KpiCard label="Selected Net Payout" value={formatINRCompact(Number(selectedRun?.total_net ?? 0))} icon={CheckCircle2} delay={0.15} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl glass p-4 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg">Runs</h3>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-gradient-gold text-background">
                  <Play className="mr-1 h-3.5 w-3.5" />Generate
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Generate payroll</DialogTitle></DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Generates payroll items for all <span className="text-foreground">active</span> employees using their salary structure
                  and the month's attendance. PF (12% basic) and TDS (5% over ₹50k gross) are auto-calculated.
                </p>
                <div>
                  <Label>Payroll month</Label>
                  <Input type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(`${e.target.value}-01`)} className="mt-1" />
                </div>
                <DialogFooter>
                  <Button onClick={() => generateRun.mutate()} disabled={generateRun.isPending} className="bg-gradient-gold text-background">
                    {generateRun.isPending ? "Generating…" : "Generate run"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {(runs.data?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No runs yet. Generate your first payroll.</p>
          ) : (
            <div className="space-y-2">
              {runs.data!.map((r) => {
                const active = r.id === selectedRunId;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    className={`block w-full rounded-lg border p-3 text-left transition-colors ${
                      active ? "border-gold/60 bg-gold/5" : "border-border/40 hover:border-gold/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{new Date(r.payroll_month).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
                        <p className="text-xs text-muted-foreground">{r.employee_count} employees · {formatINRCompact(Number(r.total_net))}</p>
                      </div>
                      <Badge variant="outline" className={STATUS_COLOR[r.status]}>{r.status}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl glass p-4 lg:col-span-2">
          {!selectedRun ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Select a run to view payslips.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg">
                    {new Date(selectedRun.payroll_month).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                  </h3>
                  <p className="text-xs text-muted-foreground">{items.data?.length ?? 0} payslips</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedRun.status !== "paid" && (
                    <Button size="sm" onClick={() => markPaid.mutate(selectedRun.id)} className="bg-gradient-gold text-background">
                      <CheckCircle2 className="mr-1 h-4 w-4" />Mark as paid
                    </Button>
                  )}
                </div>
              </div>
              <ExportBar
                from="" to=""
                onFromChange={() => {}} onToChange={() => {}}
                showDateRange={false}
                count={exportRows.length}
                onCSV={() => exportToCSV(`payroll-${selectedRun.payroll_month}`, exportRows, [
                  { header: "Code", accessor: (r: any) => r.code ?? "" },
                  { header: "Name", accessor: (r: any) => r.name ?? "" },
                  { header: "Department", accessor: (r: any) => r.department },
                  { header: "Paid Days", accessor: (r: any) => r.paid_days },
                  { header: "Gross", accessor: (r: any) => r.gross },
                  { header: "PF", accessor: (r: any) => r.pf },
                  { header: "Tax", accessor: (r: any) => r.tax },
                  { header: "Deductions", accessor: (r: any) => r.deductions },
                  { header: "Net", accessor: (r: any) => r.net },
                ])}
                onPDF={() => exportToPDF({ filename: `payroll-${selectedRun.payroll_month}`, title: `Payroll ${selectedRun.payroll_month}`, rows: exportRows, columns: [
                  { header: "Code", accessor: (r: any) => r.code ?? "" },
                  { header: "Name", accessor: (r: any) => r.name ?? "" },
                  { header: "Department", accessor: (r: any) => r.department },
                  { header: "Paid Days", accessor: (r: any) => r.paid_days },
                  { header: "Gross", accessor: (r: any) => r.gross },
                  { header: "Deductions", accessor: (r: any) => r.deductions },
                  { header: "Net", accessor: (r: any) => r.net },
                ] })}
              />
              <div className="mt-3 max-h-[520px] divide-y divide-border/40 overflow-auto">
                {(items.data ?? []).map((it: any) => (
                  <div key={it.id} className="grid grid-cols-12 items-center gap-2 py-2 text-sm">
                    <div className="col-span-4">
                      <p className="font-medium">{it.employees?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{it.employees?.employee_code} · {it.employees?.departments?.name ?? "—"}</p>
                    </div>
                    <div className="col-span-2 text-xs text-muted-foreground">{it.paid_days} paid days</div>
                    <div className="col-span-2 text-right">{formatINR(Number(it.gross_pay))}</div>
                    <div className="col-span-2 text-right text-rose-400">- {formatINR(Number(it.total_deductions))}</div>
                    <div className="col-span-2 text-right font-semibold text-gold">{formatINR(Number(it.net_pay))}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
