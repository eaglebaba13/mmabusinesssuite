import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Calendar, Users, Video, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { ImportButton } from "@/components/app/ImportButton";

export const Route = createFileRoute("/app/webinars/")({
  head: () => ({ meta: [{ title: "Webinar Campaigns — MMA Suite" }] }),
  component: WebinarsIndex,
});

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/15 text-blue-400",
  live: "bg-emerald-500/15 text-emerald-400 animate-pulse",
  completed: "bg-primary/15 text-primary",
  cancelled: "bg-rose-500/15 text-rose-400",
};

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

function WebinarsIndex() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    host_name: "",
    platform: "zoom",
    join_url: "",
    scheduled_at: "",
    duration_minutes: "60",
    capacity: "500",
    price: "0",
    status: "scheduled",
    webhook_url: "",
  });

  const list = useQuery({
    queryKey: ["webinars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webinars")
        .select("*, webinar_registrations(id, attended)")
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const slug = `${slugify(form.title)}-${Math.random().toString(36).slice(2, 6)}`;
      const { error } = await supabase.from("webinars").insert({
        title: form.title,
        slug,
        description: form.description || null,
        host_name: form.host_name || null,
        platform: form.platform as any,
        join_url: form.join_url || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_minutes: Number(form.duration_minutes),
        capacity: Number(form.capacity),
        price: Number(form.price),
        status: form.status as any,
        webhook_url: form.webhook_url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Webinar created");
      setOpen(false);
      setForm({ ...form, title: "", description: "", join_url: "", scheduled_at: "" });
      qc.invalidateQueries({ queryKey: ["webinars"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't create webinar"),
  });

  const copyRegLink = (slug: string) => {
    const url = `${window.location.origin}/webinar/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Registration link copied");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">Campaigns</h2>
          <p className="text-sm text-muted-foreground">All scheduled and past webinars.</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton configKey="webinars" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-background shadow-gold">
                <Plus className="mr-2 h-4 w-4" /> New Webinar
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>New webinar</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Host</Label><Input value={form.host_name} onChange={(e) => setForm({ ...form, host_name: e.target.value })} /></div>
                <div>
                  <Label>Platform</Label>
                  <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zoom">Zoom</SelectItem>
                      <SelectItem value="google_meet">Google Meet</SelectItem>
                      <SelectItem value="youtube">YouTube Live</SelectItem>
                      <SelectItem value="teams">MS Teams</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Join URL</Label><Input placeholder="https://…" value={form.join_url} onChange={(e) => setForm({ ...form, join_url: e.target.value })} /></div>
              <div><Label>Webhook URL <span className="text-[10px] text-muted-foreground">(optional · receives registration & reminder events)</span></Label><Input placeholder="https://your-automation/webhook" value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Scheduled at *</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
                <div><Label>Duration (min)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Capacity</Label><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
                <div><Label>Price (₹)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!form.title || !form.scheduled_at || create.isPending}>
                {create.isPending ? "Saving…" : "Create webinar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(list.data ?? []).map((w: any) => {
          const regs = w.webinar_registrations ?? [];
          const attended = regs.filter((r: any) => r.attended).length;
          return (
            <Card key={w.id} className="glass hover-gold-glow group p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
                  <Video className="h-5 w-5 text-background" />
                </div>
                <Badge className={STATUS_STYLES[w.status]}>{w.status}</Badge>
              </div>
              <h3 className="mt-3 font-display text-lg leading-tight">{w.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground capitalize">{w.platform.replace("_", " ")} · {w.host_name ?? "—"}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(w.scheduled_at), "dd MMM, HH:mm")}</span>
                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{regs.length}/{w.capacity}</span>
              </div>
              <div className="mt-2">
                <Progress value={w.capacity ? Math.min(100, Math.round((regs.length / w.capacity) * 100)) : 0} className="h-1" />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>{w.capacity ? Math.min(100, Math.round((regs.length / w.capacity) * 100)) : 0}% full</span>
                  <span>{Math.max(0, w.capacity - regs.length)} left</span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <Link to="/app/webinars/$webinarId" params={{ webinarId: w.id }} className="flex-1">
                  <Button size="sm" variant="outline" className="w-full">Manage</Button>
                </Link>
                <Button size="sm" variant="outline" onClick={() => copyRegLink(w.slug)} title="Copy registration link">
                  <Copy className="h-3 w-3" />
                </Button>
                {w.join_url && (
                  <a href={w.join_url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline"><ExternalLink className="h-3 w-3" /></Button>
                  </a>
                )}
              </div>
              {regs.length > 0 && (
                <div className="mt-3 text-[11px] text-muted-foreground">
                  Attendance: <span className="text-foreground font-medium">{attended}/{regs.length}</span> ({regs.length ? Math.round((attended / regs.length) * 100) : 0}%)
                </div>
              )}
            </Card>
          );
        })}
        {list.data?.length === 0 && (
          <Card className="col-span-full p-10 text-center text-muted-foreground">No webinars yet — create your first campaign.</Card>
        )}
      </div>
    </div>
  );
}
