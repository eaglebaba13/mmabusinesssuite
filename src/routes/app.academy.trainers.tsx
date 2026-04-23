import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ImportButton } from "@/components/app/ImportButton";

export const Route = createFileRoute("/app/academy/trainers")({
  head: () => ({ meta: [{ title: "Trainers — Academy" }] }),
  component: TrainersPage,
});

function TrainersPage() {
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("academy_admin");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    full_name: "", email: "", phone: "", specialization: "", bio: "",
  });

  const trainers = useQuery({
    queryKey: ["trainers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("trainers")
        .select("*, batches(id, batch_code, status)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("trainers").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trainer added");
      qc.invalidateQueries({ queryKey: ["trainers"] });
      setOpen(false);
      setForm({ full_name: "", email: "", phone: "", specialization: "", bio: "" });
    },
    onError: () => toast.error("Couldn't add trainer"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">Trainers</h2>
          <p className="text-sm text-muted-foreground">Faculty roster and batch assignments.</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <ImportButton configKey="trainers" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-background shadow-gold hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" /> New Trainer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Trainer</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Full Name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div><Label>Specialization</Label><Input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} /></div>
                <div><Label>Bio</Label><Textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!form.full_name || create.isPending}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(trainers.data ?? []).map((t: any) => (
          <Card key={t.id} className="glass hover-gold-glow p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg">{t.full_name}</h3>
                <p className="text-xs text-muted-foreground">{t.specialization}</p>
              </div>
              <Badge variant={t.active ? "default" : "secondary"} className={t.active ? "bg-emerald-500/15 text-emerald-400" : ""}>
                {t.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{t.bio}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {(t.batches ?? []).map((b: any) => (
                <span key={b.id} className="rounded bg-muted px-2 py-0.5 text-xs">{b.batch_code}</span>
              ))}
            </div>
            <div className="mt-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
              {t.email} · {t.phone}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
