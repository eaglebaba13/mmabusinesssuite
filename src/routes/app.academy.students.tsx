import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ExportBar } from "@/components/app/ExportBar";
import { defaultDateRange, exportToCSV, exportToPDF, inDateRange } from "@/lib/export";
import { ImportButton } from "@/components/app/ImportButton";
import { usePersistedState } from "@/hooks/use-persisted-state";

export const Route = createFileRoute("/app/academy/students")({
  head: () => ({ meta: [{ title: "Students — Academy" }] }),
  component: StudentsPage,
});

function StudentsPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("academy_admin");
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState(defaultDateRange());
  const emptyStudent = { full_name: "", email: "", phone: "", city: "", gender: "", guardian_name: "", guardian_phone: "" };
  const [form, setForm, clearFormDraft] = usePersistedState("academy.students.new", emptyStudent);

  const students = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, enrollments(id, status, batches(batch_code))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("students").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student added");
      qc.invalidateQueries({ queryKey: ["students"] });
      setOpen(false);
      setForm(emptyStudent);
      clearFormDraft();
    },
    onError: () => toast.error("Couldn't add student"),
  });

  const filtered = (students.data ?? []).filter((s: any) =>
    (!q || s.full_name?.toLowerCase().includes(q.toLowerCase()) ||
      s.email?.toLowerCase().includes(q.toLowerCase()) ||
      s.phone?.includes(q)) &&
    inDateRange(s.created_at, range.from, range.to)
  );

  const exportCols = [
    { header: "Name", accessor: (s: any) => s.full_name ?? "" },
    { header: "Email", accessor: (s: any) => s.email ?? "" },
    { header: "Phone", accessor: (s: any) => s.phone ?? "" },
    { header: "City", accessor: (s: any) => s.city ?? "" },
    { header: "Gender", accessor: (s: any) => s.gender ?? "" },
    { header: "Guardian", accessor: (s: any) => s.guardian_name ?? "" },
    { header: "Enrollments", accessor: (s: any) => (s.enrollments ?? []).map((e: any) => `${e.batches?.batch_code ?? ""}:${e.status}`).join(" | ") },
    { header: "Joined", accessor: (s: any) => s.created_at?.slice(0, 10) ?? "" },
  ];
  const fileBase = `students_${range.from}_to_${range.to}`;
  const onCSV = () => exportToCSV(fileBase, filtered, exportCols);
  const onPDF = () =>
    exportToPDF({
      filename: fileBase,
      title: "Academy Students",
      subtitle: `${range.from} → ${range.to}`,
      rows: filtered,
      columns: exportCols,
      totals: [{ label: "Total students", value: String(filtered.length) }],
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">Students</h2>
          <p className="text-sm text-muted-foreground">All learners across the academy.</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <ImportButton configKey="students" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-background shadow-gold hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" /> New Student
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>New Student</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Full Name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                  <div><Label>Gender</Label><Input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Guardian</Label><Input value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} /></div>
                  <div><Label>Guardian Phone</Label><Input value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!form.full_name || create.isPending}>
                  {create.isPending ? "Saving…" : "Add Student"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone" className="pl-9" />
      </div>

      <ExportBar
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onCSV={onCSV}
        onPDF={onPDF}
        count={filtered.length}
      />

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Enrollments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-medium">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{s.gender ?? ""}</div>
                </TableCell>
                <TableCell className="text-sm">
                  <div>{s.email ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{s.phone ?? "—"}</div>
                </TableCell>
                <TableCell>{s.city ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {s.enrollments?.length ? s.enrollments.map((e: any) => (
                      <span key={e.id} className="rounded bg-muted px-2 py-0.5 text-xs">
                        {e.batches?.batch_code} · {e.status}
                      </span>
                    )) : <span className="text-xs text-muted-foreground">none</span>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
