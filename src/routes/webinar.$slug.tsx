import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, Clock, Users, Video, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/webinar/$slug")({
  validateSearch: (s: Record<string, unknown>) => ({
    utm_source: (s.utm_source as string) || undefined,
    utm_medium: (s.utm_medium as string) || undefined,
    utm_campaign: (s.utm_campaign as string) || undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Register · ${params.slug} — MMA Webinar` },
      { name: "description", content: "Register for our upcoming live webinar." },
    ],
  }),
  component: PublicRegister,
});

const formSchema = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().email("Valid email required").max(200),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
});

function PublicRegister() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const [form, setForm] = React.useState({ full_name: "", email: "", phone: "", city: "" });
  const [done, setDone] = React.useState(false);

  const webinar = useQuery({
    queryKey: ["pub-webinar", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webinars")
        .select("id, title, description, host_name, scheduled_at, duration_minutes, capacity, platform, status, cover_url")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const register = useMutation({
    mutationFn: async () => {
      const parsed = formSchema.parse(form);
      if (!webinar.data) throw new Error("Webinar not found");
      const { error } = await supabase.from("webinar_registrations").insert({
        webinar_id: webinar.data.id,
        full_name: parsed.full_name,
        email: parsed.email,
        phone: parsed.phone || null,
        city: parsed.city || null,
        utm_source: search.utm_source ?? null,
        utm_medium: search.utm_medium ?? null,
        utm_campaign: search.utm_campaign ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDone(true);
      toast.success("You're registered!");
    },
    onError: (e: any) => {
      const msg = e?.message ?? "Registration failed";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error("You are already registered with this email.");
      } else {
        toast.error(msg);
      }
    },
  });

  if (webinar.isLoading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!webinar.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md p-10 text-center">
          <h1 className="font-display text-2xl">Webinar not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This registration link is invalid or the event has been cancelled.</p>
        </Card>
      </div>
    );
  }

  const w = webinar.data;
  const isCancelled = w.status === "cancelled";
  const isCompleted = w.status === "completed";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-2 lg:py-20">
        <div>
          <Badge variant="outline" className="border-gold/40 capitalize text-gold">{w.platform.replace("_", " ")} · Live Webinar</Badge>
          <h1 className="mt-4 font-display text-4xl leading-tight md:text-5xl">{w.title}</h1>
          {w.host_name && <p className="mt-2 text-sm text-muted-foreground">Hosted by <span className="text-foreground">{w.host_name}</span></p>}
          {w.description && <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{w.description}</p>}

          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Calendar className="h-3.5 w-3.5" />Date & time</div>
              <div className="mt-1 font-medium">{format(new Date(w.scheduled_at), "dd MMM yyyy, HH:mm")}</div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />Duration</div>
              <div className="mt-1 font-medium">{w.duration_minutes} minutes</div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />Seats</div>
              <div className="mt-1 font-medium">{w.capacity}</div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Video className="h-3.5 w-3.5" />Format</div>
              <div className="mt-1 font-medium capitalize">Live online</div>
            </div>
          </div>
        </div>

        <Card className="glass h-fit p-7">
          {done ? (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="font-display text-2xl">You're in!</h2>
              <p className="text-sm text-muted-foreground">
                We've saved your spot for <span className="text-foreground">{w.title}</span>. Check your inbox for joining details before {format(new Date(w.scheduled_at), "dd MMM, HH:mm")}.
              </p>
            </div>
          ) : isCancelled ? (
            <div className="text-center">
              <h2 className="font-display text-xl">Event cancelled</h2>
              <p className="mt-2 text-sm text-muted-foreground">This webinar has been cancelled. Please follow us for upcoming sessions.</p>
            </div>
          ) : isCompleted ? (
            <div className="text-center">
              <h2 className="font-display text-xl">This webinar has ended</h2>
              <p className="mt-2 text-sm text-muted-foreground">Registration is closed. Stay tuned for the next session.</p>
            </div>
          ) : (
            <>
              <h2 className="font-display text-2xl">Reserve your seat</h2>
              <p className="mt-1 text-sm text-muted-foreground">It's free. Takes 30 seconds.</p>
              <form
                className="mt-5 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  register.mutate();
                }}
              >
                <div><Label>Full name *</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" /></div>
                <div><Label>Email *</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
                  <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" /></div>
                </div>
                <Button type="submit" disabled={register.isPending} className="mt-2 w-full bg-gradient-gold text-background shadow-gold">
                  {register.isPending ? "Reserving…" : "Reserve my seat →"}
                </Button>
                <p className="text-center text-[10px] text-muted-foreground">By registering you agree to receive event updates.</p>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
