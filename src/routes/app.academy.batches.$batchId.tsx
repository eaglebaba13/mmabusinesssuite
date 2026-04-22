import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserPlus, Check, X, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatINR } from "@/lib/format";

export const Route = createFileRoute("/app/academy/batches/$batchId")({
  head: () => ({ meta: [{ title: "Batch — Academy" }] }),
  component: BatchDetail,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <div className="p-8 text-center">
        <p className="text-rose-400">Couldn't load batch.</p>
        <Button onClick={() => router.invalidate()} className="mt-4">Retry</Button>
      </div>
    );
  },
});

const ATT_STYLES: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-400",
  absent: "bg-rose-500/15 text-rose-400",
  late: "bg-amber-500/15 text-amber-400",
  excused: "bg-blue-500/15 text-blue-400",
};

function BatchDetail() {
  const { batchId } = Route.useParams();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [attDate, setAttDate] = React.useState(today);
  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const [studentId, setStudentId] = React.useState("");

  const batch = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("*, courses(*), trainers(full_name)")
        .eq("id", batchId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const enrollments = useQuery({
    queryKey: ["batch-enrollments", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*, students(full_name, email, phone)")
        .eq("batch_id", batchId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const attendance = useQuery({
    queryKey: ["batch-attendance", batchId, attDate],
    queryFn: async () => {
      const enrollIds = (enrollments.data ?? []).map((e) => e.id);
      if (!enrollIds.length) return {};
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .in("enrollment_id", enrollIds)
        .eq("attendance_date", attDate);
      const map: Record<string, string> = {};
      (data ?? []).forEach((a) => { map[a.enrollment_id] = a.status; });
      return map;
    },
    enabled: !!enrollments.data,
  });

  const students = useQuery({
    queryKey: ["students-lite"],
    queryFn: async () => (await supabase.from("students").select("id, full_name, email")).data ?? [],
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("enrollments").insert({
        student_id: studentId,
        batch_id: batchId,
        total_fee: Number(batch.data?.courses?.fee_amount ?? 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student enrolled");
      qc.invalidateQueries({ queryKey: ["batch-enrollments", batchId] });
      setEnrollOpen(false); setStudentId("");
    },
    onError: () => toast.error("Couldn't enroll student (already enrolled?)"),
  });

  const markAtt = useMutation({
    mutationFn: async ({ enrollment_id, status }: { enrollment_id: string; status: string }) => {
      const { error } = await supabase.from("attendance").upsert(
        { enrollment_id, attendance_date: attDate, status: status as any },
        { onConflict: "enrollment_id,attendance_date" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["batch-attendance", batchId, attDate] }),
    onError: () => toast.error("Couldn't mark attendance"),
  });

  const issueCert = useMutation({
    mutationFn: async (enrollment_id: string) => {
      const code = "CERT-" + Math.random().toString(36).slice(2, 10).toUpperCase();
      await supabase.from("enrollments").update({ status: "completed" as any }).eq("id", enrollment_id);
      const { error } = await supabase.from("certificates").insert({ enrollment_id, certificate_code: code, grade: "A" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificate issued");
      qc.invalidateQueries({ queryKey: ["batch-enrollments", batchId] });
    },
    onError: () => toast.error("Couldn't issue certificate"),
  });

  const b = batch.data;
  if (!b) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-5">
      <Link to="/app/academy/batches" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> All batches
      </Link>

      <Card className="glass p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="outline" className="border-primary/40 text-primary">{b.batch_code}</Badge>
            <h2 className="mt-2 font-display text-2xl text-gradient-gold">{b.courses?.title}</h2>
            <p className="text-sm text-muted-foreground">
              {b.start_date} → {b.end_date ?? "—"} · {b.mode} · {b.location ?? "—"}
            </p>
            <p className="mt-1 text-sm">Trainer: <span className="text-foreground">{b.trainers?.full_name ?? "Unassigned"}</span></p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">Fee</div>
            <div className="font-display text-xl text-gradient-gold">{formatINR(Number(b.courses?.fee_amount ?? 0))}</div>
            <Badge className="mt-2">{b.status}</Badge>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-lg">Enrolled Students</h3>
          <Badge variant="outline">{enrollments.data?.length ?? 0} / {b.capacity}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Attendance for</Label>
          <Input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="w-auto" />
          <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-gradient-gold text-background"><UserPlus className="mr-1 h-3 w-3" />Enroll</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enroll Student</DialogTitle></DialogHeader>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Pick a student" /></SelectTrigger>
                <SelectContent>
                  {(students.data ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name} — {s.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button onClick={() => enroll.mutate()} disabled={!studentId || enroll.isPending}>Enroll</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attendance ({attDate})</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(enrollments.data ?? []).map((e: any) => {
              const att = attendance.data?.[e.id];
              return (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium">{e.students?.full_name}</div>
                    <div className="text-xs text-muted-foreground">{e.students?.email}</div>
                  </TableCell>
                  <TableCell><Badge>{e.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {(["present", "absent", "late", "excused"] as const).map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={att === s ? "default" : "ghost"}
                          className={att === s ? ATT_STYLES[s] : ""}
                          onClick={() => markAtt.mutate({ enrollment_id: e.id, status: s })}
                        >
                          {s === "present" ? <Check className="h-3 w-3" /> : s === "absent" ? <X className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          <span className="ml-1 capitalize">{s}</span>
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {e.status !== "completed" && (
                      <Button size="sm" variant="outline" onClick={() => issueCert.mutate(e.id)}>
                        Issue Certificate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {enrollments.data?.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No students enrolled yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
