import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatINR } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/academy/courses")({
  head: () => ({ meta: [{ title: "Courses — Academy" }] }),
  component: CoursesPage,
});

interface CourseForm {
  title: string; code: string; description: string;
  duration_weeks: number; fee_amount: number; level: string;
  status: "draft" | "published" | "archived";
}

const empty: CourseForm = {
  title: "", code: "", description: "", duration_weeks: 8, fee_amount: 25000,
  level: "beginner", status: "published",
};

function CoursesPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("academy_admin");
  const [open, setOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<CourseForm>(empty);

  const courses = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("courses").update(form).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Course updated" : "Course created");
      qc.invalidateQueries({ queryKey: ["courses"] });
      setOpen(false); setEditId(null); setForm(empty);
    },
    onError: (e: any) => {
      console.error(e);
      toast.error("Couldn't save course");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Course deleted");
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: () => toast.error("Couldn't delete course"),
  });

  function openEdit(c: any) {
    setEditId(c.id);
    setForm({
      title: c.title, code: c.code ?? "", description: c.description ?? "",
      duration_weeks: c.duration_weeks, fee_amount: Number(c.fee_amount),
      level: c.level ?? "beginner", status: c.status,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">Course Catalog</h2>
          <p className="text-sm text-muted-foreground">Curated programmes offered across the academy.</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditId(null); setForm(empty); } }}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-background shadow-gold hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" /> New Course
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editId ? "Edit Course" : "New Course"}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                  <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
                </div>
                <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Weeks</Label><Input type="number" value={form.duration_weeks} onChange={(e) => setForm({ ...form, duration_weeks: Number(e.target.value) })} /></div>
                  <div><Label>Fee (₹)</Label><Input type="number" value={form.fee_amount} onChange={(e) => setForm({ ...form, fee_amount: Number(e.target.value) })} /></div>
                  <div>
                    <Label>Level</Label>
                    <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => save.mutate()} disabled={!form.title || save.isPending}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(courses.data ?? []).map((c: any) => (
          <Card key={c.id} className="glass hover-gold-glow group flex flex-col p-5">
            <div className="flex items-start justify-between">
              <div>
                <Badge variant="outline" className="border-primary/40 text-primary">{c.code ?? "—"}</Badge>
                <h3 className="mt-2 font-display text-lg">{c.title}</h3>
              </div>
              <Badge className={c.status === "published" ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}>{c.status}</Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Fee</div>
                <div className="font-display text-xl text-gradient-gold">{formatINR(Number(c.fee_amount))}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{c.duration_weeks} weeks</div>
                <div className="capitalize">{c.level}</div>
              </div>
            </div>
            {canEdit && (
              <div className="mt-4 flex gap-2 border-t border-border/50 pt-3">
                <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                <Button size="sm" variant="ghost" className="text-rose-400 hover:text-rose-300" onClick={() => confirm("Delete this course?") && remove.mutate(c.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
                </Button>
              </div>
            )}
          </Card>
        ))}
        {courses.data?.length === 0 && (
          <Card className="col-span-full p-10 text-center text-muted-foreground">No courses yet.</Card>
        )}
      </div>
    </div>
  );
}
