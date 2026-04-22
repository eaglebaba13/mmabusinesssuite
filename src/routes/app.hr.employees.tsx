import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportBar } from "@/components/app/ExportBar";
import { exportToCSV, exportToPDF } from "@/lib/export";
import { formatINR } from "@/lib/format";

export const Route = createFileRoute("/app/hr/employees")({
  component: EmployeesPage,
});

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern", "consultant"] as const;
const STATUSES = ["active", "on_leave", "suspended", "terminated", "resigned"] as const;

const STATUS_COLOR: Record<string, string> = {
  active: "border-emerald-400/40 text-emerald-400",
  on_leave: "border-amber-400/40 text-amber-400",
  suspended: "border-orange-400/40 text-orange-400",
  terminated: "border-rose-400/40 text-rose-400",
  resigned: "border-slate-400/40 text-slate-400",
};

function blankForm() {
  return {
    employee_code: "",
    full_name: "",
    email: "",
    phone: "",
    designation: "",
    department_id: "",
    employment_type: "full_time" as (typeof EMPLOYMENT_TYPES)[number],
    status: "active" as (typeof STATUSES)[number],
    date_of_joining: new Date().toISOString().slice(0, 10),
    monthly_ctc: "",
    basic_salary: "",
    hra: "",
    allowances: "",
    city: "",
    state: "",
  };
}

function EmployeesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(blankForm());
  const [search, setSearch] = React.useState("");
  const [deptFilter, setDeptFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const depts = useQuery({
    queryKey: ["hr-depts"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*").order("name");
      return data ?? [];
    },
  });

  const list = useQuery({
    queryKey: ["hr-employees"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("*, departments(name, code)")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        employee_code: form.employee_code,
        full_name: form.full_name,
        email: form.email || null,
        phone: form.phone || null,
        designation: form.designation || null,
        department_id: form.department_id || null,
        employment_type: form.employment_type,
        status: form.status,
        date_of_joining: form.date_of_joining,
        monthly_ctc: Number(form.monthly_ctc || 0),
        basic_salary: Number(form.basic_salary || 0),
        hra: Number(form.hra || 0),
        allowances: Number(form.allowances || 0),
        city: form.city || null,
        state: form.state || null,
      };
      if (editingId) {
        const { error } = await supabase.from("employees").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Employee updated" : "Employee added");
      setOpen(false);
      setEditingId(null);
      setForm(blankForm());
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      qc.invalidateQueries({ queryKey: ["hr-overview"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return (list.data ?? []).filter((e: any) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (deptFilter !== "all" && e.department_id !== deptFilter) return false;
      if (!q) return true;
      return (
        e.full_name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q) ||
        (e.email ?? "").toLowerCase().includes(q) ||
        (e.designation ?? "").toLowerCase().includes(q)
      );
    });
  }, [list.data, search, deptFilter, statusFilter]);

  const openEdit = (e: any) => {
    setEditingId(e.id);
    setForm({
      employee_code: e.employee_code,
      full_name: e.full_name,
      email: e.email ?? "",
      phone: e.phone ?? "",
      designation: e.designation ?? "",
      department_id: e.department_id ?? "",
      employment_type: e.employment_type,
      status: e.status,
      date_of_joining: e.date_of_joining,
      monthly_ctc: String(e.monthly_ctc ?? ""),
      basic_salary: String(e.basic_salary ?? ""),
      hra: String(e.hra ?? ""),
      allowances: String(e.allowances ?? ""),
      city: e.city ?? "",
      state: e.state ?? "",
    });
    setOpen(true);
  };

  const exportRows = filtered.map((e: any) => ({
    code: e.employee_code,
    name: e.full_name,
    email: e.email ?? "",
    phone: e.phone ?? "",
    designation: e.designation ?? "",
    department: e.departments?.name ?? "",
    employment_type: e.employment_type,
    status: e.status,
    date_of_joining: e.date_of_joining,
    monthly_ctc: e.monthly_ctc,
  }));

  return (
    <div className="space-y-4">
      <ExportBar
        from=""
        to=""
        onFromChange={() => {}}
        onToChange={() => {}}
        showDateRange={false}
        count={filtered.length}
        onCSV={() => exportToCSV("employees", exportRows, [
          { header: "Code", accessor: (r: any) => r.code },
          { header: "Name", accessor: (r: any) => r.name },
          { header: "Email", accessor: (r: any) => r.email },
          { header: "Phone", accessor: (r: any) => r.phone },
          { header: "Designation", accessor: (r: any) => r.designation },
          { header: "Department", accessor: (r: any) => r.department },
          { header: "Type", accessor: (r: any) => r.employment_type },
          { header: "Status", accessor: (r: any) => r.status },
          { header: "Joined", accessor: (r: any) => r.date_of_joining },
          { header: "CTC", accessor: (r: any) => r.monthly_ctc },
        ])}
        onPDF={() => exportToPDF({ filename: "employees", title: "Employees", rows: exportRows, columns: [
          { header: "Code", accessor: (r: any) => r.code },
          { header: "Name", accessor: (r: any) => r.name },
          { header: "Department", accessor: (r: any) => r.department },
          { header: "Designation", accessor: (r: any) => r.designation },
          { header: "Status", accessor: (r: any) => r.status },
          { header: "Joined", accessor: (r: any) => r.date_of_joining },
          { header: "CTC", accessor: (r: any) => r.monthly_ctc },
        ] })}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, code, email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="sm:w-[180px]"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {(depts.data ?? []).map((d: any) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(blankForm()); } }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />Add employee</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit employee" : "New employee"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Employee code *</Label><Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} className="mt-1" /></div>
              <div><Label>Full name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>Designation</Label><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="mt-1" /></div>
              <div>
                <Label>Department</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(depts.data ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Employment type</Label>
                <Select value={form.employment_type} onValueChange={(v: any) => setForm({ ...form, employment_type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Date of joining</Label><Input type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} className="mt-1" /></div>
              <div><Label>Monthly CTC (₹)</Label><Input type="number" value={form.monthly_ctc} onChange={(e) => setForm({ ...form, monthly_ctc: e.target.value })} className="mt-1" /></div>
              <div><Label>Basic salary (₹)</Label><Input type="number" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} className="mt-1" /></div>
              <div><Label>HRA (₹)</Label><Input type="number" value={form.hra} onChange={(e) => setForm({ ...form, hra: e.target.value })} className="mt-1" /></div>
              <div><Label>Allowances (₹)</Label><Input type="number" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} className="mt-1" /></div>
              <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" /></div>
              <div><Label>State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="mt-1" /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => upsert.mutate()} disabled={upsert.isPending || !form.employee_code || !form.full_name} className="bg-gradient-gold text-background">
                {upsert.isPending ? "Saving…" : editingId ? "Save changes" : "Add employee"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl glass overflow-hidden">
        {list.isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No employees match your filters.</div>
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map((e: any) => {
              const initials = e.full_name.split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
              return (
                <button
                  key={e.id}
                  onClick={() => openEdit(e)}
                  className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-foreground/5"
                >
                  <Avatar className="h-10 w-10 border border-gold/30">
                    <AvatarFallback className="bg-background text-xs text-gold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{e.full_name}</p>
                      <span className="text-xs text-muted-foreground">{e.employee_code}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.designation ?? "—"} {e.departments?.name ? `· ${e.departments.name}` : ""}
                    </p>
                  </div>
                  <div className="hidden text-right md:block">
                    <p className="text-sm font-medium">{formatINR(Number(e.monthly_ctc ?? 0))}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{e.employment_type.replace("_", " ")}</p>
                  </div>
                  <Badge variant="outline" className={STATUS_COLOR[e.status] ?? ""}>{e.status.replace("_", " ")}</Badge>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
