import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ImportButton } from "@/components/app/ImportButton";
import { usePersistedState } from "@/hooks/use-persisted-state";

export const Route = createFileRoute("/app/academy/batches")({
  head: () => ({ meta: [{ title: "Batches — Academy" }] }),
  component: BatchesPage,
});

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-blue-500/15 text-blue-400",
  ongoing: "bg-emerald-500/15 text-emerald-400",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-rose-500/15 text-rose-400",
};

function BatchesPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("academy_admin");
  const [open, setOpen] = React.useState(false);
  const emptyBatch = {
    course_id: "", trainer_id: "", batch_code: "", start_date: "", end_date: "",
    capacity: 25, mode: "offline" as "online" | "offline" | "hybrid", location: "Mumbai HQ",
    status: "upcoming" as "upcoming" | "ongoing" | "completed" | "cancelled",
  };
  const [form, setForm, clearFormDraft] = usePersistedState("academy.batches.new", emptyBatch);

  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("*, courses(title, code), trainers(full_name), enrollments(count)")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const courses = useQuery({
    queryKey: ["courses-lite"],
    queryFn: async () => (await supabase.from("courses").select("id, title, code")).data ?? [],
  });

  const trainers = useQuery({
    queryKey: ["trainers-lite"],
    queryFn: async () => (await supabase.from("trainers").select("id, full_name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("batches").insert({
        ...form,
        trainer_id: form.trainer_id || null,
        end_date: form.end_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Batch created");
      qc.invalidateQueries({ queryKey: ["batches"] });
      setOpen(false);
    },
    onError: () => toast.error("Couldn't create batch"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">Batches</h2>
          <p className="text-sm text-muted-foreground">Scheduled cohorts running across centres.</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <ImportButton configKey="batches" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-background shadow-gold hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" /> New Batch
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>New Batch</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Course</Label>
                    <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {(courses.data ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Trainer</Label>
                    <Select value={form.trainer_id} onValueChange={(v) => setForm({ ...form, trainer_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        {(trainers.data ?? []).map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Batch Code</Label><Input value={form.batch_code} onChange={(e) => setForm({ ...form, batch_code: e.target.value })} placeholder="B-XXX-2026A" /></div>
                  <div><Label>Capacity</Label><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                  <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Mode</Label>
                    <Select value={form.mode} onValueChange={(v: any) => setForm({ ...form, mode: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offline">Offline</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="ongoing">Ongoing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!form.course_id || !form.batch_code || !form.start_date || create.isPending}>
                  {create.isPending ? "Creating…" : "Create Batch"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch Code</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Trainer</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Enrolled</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(batches.data ?? []).map((b: any) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs">{b.batch_code}</TableCell>
                <TableCell>
                  <div className="font-medium">{b.courses?.title ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{b.courses?.code}</div>
                </TableCell>
                <TableCell>{b.trainers?.full_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-xs">
                  {b.start_date}<br />
                  <span className="text-muted-foreground">to {b.end_date ?? "—"}</span>
                </TableCell>
                <TableCell className="capitalize">{b.mode}</TableCell>
                <TableCell>{b.enrollments?.[0]?.count ?? 0} / {b.capacity}</TableCell>
                <TableCell><Badge className={STATUS_COLORS[b.status]}>{b.status}</Badge></TableCell>
                <TableCell>
                  <Link to="/app/academy/batches/$batchId" params={{ batchId: b.id }}>
                    <Button size="sm" variant="ghost">Open<ArrowRight className="ml-1 h-3 w-3" /></Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
