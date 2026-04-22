import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/app/hr/leave")({
  component: LeavePage,
});

const LEAVE_TYPES = ["casual", "sick", "paid", "unpaid", "comp_off", "maternity", "paternity"] as const;
const STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

const STATUS_COLOR: Record<string, string> = {
  pending: "border-amber-400/40 text-amber-400",
  approved: "border-emerald-400/40 text-emerald-400",
  rejected: "border-rose-400/40 text-rose-400",
  cancelled: "border-slate-400/40 text-slate-400",
};

function diffDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const f = new Date(from); const t = new Date(to);
  return Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
}

function LeavePage() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [form, setForm] = React.useState({
    employee_id: "",
    leave_type: "casual" as (typeof LEAVE_TYPES)[number],
    from_date: new Date().toISOString().slice(0, 10),
    to_date: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  const employees = useQuery({
    queryKey: ["hr-employees-leave"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, full_name, employee_code").order("full_name");
      return data ?? [];
    },
  });

  const list = useQuery({
    queryKey: ["hr-leaves", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("leave_requests")
        .select("*, employees(full_name, employee_code)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
      const { data } = await q;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const days = diffDays(form.from_date, form.to_date);
      const { error } = await supabase.from("leave_requests").insert({
        employee_id: form.employee_id,
        leave_type: form.leave_type,
        from_date: form.from_date,
        to_date: form.to_date,
        days,
        reason: form.reason || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave request created");
      setOpen(false);
      setForm({ ...form, employee_id: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["hr-leaves"] });
      qc.invalidateQueries({ queryKey: ["hr-overview"] });
      qc.invalidateQueries({ queryKey: ["hr-recent-leaves"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("leave_requests")
        .update({ status, approver_id: u.user?.id, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Leave ${vars.status}`);
      qc.invalidateQueries({ queryKey: ["hr-leaves"] });
      qc.invalidateQueries({ queryKey: ["hr-overview"] });
      qc.invalidateQueries({ queryKey: ["hr-recent-leaves"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />New leave request</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New leave request</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Employee *</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(employees.data ?? []).map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Leave type</Label>
                  <Select value={form.leave_type} onValueChange={(v: any) => setForm({ ...form, leave_type: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Days</Label>
                  <Input value={diffDays(form.from_date, form.to_date)} readOnly className="mt-1" />
                </div>
                <div><Label>From</Label><Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} className="mt-1" /></div>
                <div><Label>To</Label><Input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} className="mt-1" /></div>
              </div>
              <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="mt-1" rows={3} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !form.employee_id} className="bg-gradient-gold text-background">
                {create.isPending ? "Saving…" : "Submit request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl glass overflow-hidden">
        {list.isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading…</div>
        ) : (list.data?.length ?? 0) === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No leave requests.</div>
        ) : (
          <div className="divide-y divide-border/40">
            {list.data!.map((l: any) => (
              <div key={l.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-medium">{l.employees?.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{l.employees?.employee_code}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p className="capitalize">{l.leave_type.replace("_", " ")}</p>
                  <p>{l.from_date} → {l.to_date} · <span className="text-foreground">{l.days}d</span></p>
                </div>
                <div className="hidden max-w-[200px] flex-1 truncate text-xs text-muted-foreground md:block">
                  {l.reason ?? "—"}
                </div>
                <Badge variant="outline" className={STATUS_COLOR[l.status]}>{l.status}</Badge>
                {l.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="border-emerald-400/40 text-emerald-400 hover:bg-emerald-400/10" onClick={() => decide.mutate({ id: l.id, status: "approved" })}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="border-rose-400/40 text-rose-400 hover:bg-rose-400/10" onClick={() => decide.mutate({ id: l.id, status: "rejected" })}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
