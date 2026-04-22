import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, Clock, Users, Video, CheckCircle2, ExternalLink } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShareButtons } from "@/components/marketing/ShareButtons";

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
        .select("id, title, description, host_name, scheduled_at, duration_minutes, capacity, platform, status, cover_url, join_url")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const seats = useQuery({
    queryKey: ["pub-webinar-seats", webinar.data?.id],
    enabled: !!webinar.data?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("webinar_seats_taken", { _webinar_id: webinar.data!.id });
      return (data as number) ?? 0;
    },
    refetchInterval: 30000,
  });

  const register = useMutation({
    mutationFn: async () => {
      const parsed = formSchema.parse(form);
      if (!webinar.data) throw new Error("Webinar not found");
      const { data, error } = await supabase
        .from("webinar_registrations")
        .insert({
          webinar_id: webinar.data.id,
          full_name: parsed.full_name,
          email: parsed.email,
          phone: parsed.phone || null,
          city: parsed.city || null,
          utm_source: search.utm_source ?? null,
          utm_medium: search.utm_medium ?? null,
          utm_campaign: search.utm_campaign ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      // Fire confirmation webhook (non-blocking)
      fetch("/api/public/webinar-register-hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: data.id }),
      }).catch(() => {});
    },
    onSuccess: () => {
      setDone(true);
      toast.success("You're registered!");
    },
    onError: (e: any) => {
      const msg = e?.message ?? "Registration failed";
      if (msg.toLowerCase().includes("capacity")) {
        toast.error("Sorry — this webinar is now full.");
      } else if (msg.includes("duplicate") || msg.includes("unique")) {
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
  const taken = seats.data ?? 0;
  const remaining = Math.max(0, w.capacity - taken);
  const fillPct = w.capacity ? Math.min(100, Math.round((taken / w.capacity) * 100)) : 0;
  const isFull = remaining <= 0;
  const minsUntil = (new Date(w.scheduled_at).getTime() - Date.now()) / 60000;
  const joinOpen = w.join_url && minsUntil <= 30 && minsUntil >= -((w.duration_minutes ?? 60) + 30);

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
            <div className="col-span-2 rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Users className="h-3.5 w-3.5" />Seats</span>
                <span className={isFull ? "font-medium text-rose-400" : "font-medium text-foreground"}>
                  {isFull ? "Sold out" : `${remaining} of ${w.capacity} left`}
                </span>
              </div>
              <Progress value={fillPct} className="mt-2 h-1.5" />
            </div>
            <div className="col-span-2 rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Video className="h-3.5 w-3.5" />Format</div>
              <div className="mt-1 font-medium capitalize">Live online</div>
            </div>
          </div>
        </div>

        <Card className="glass h-fit p-7">
          {done ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="font-display text-2xl">You're in!</h2>
              <p className="text-sm text-muted-foreground">
                We've saved your spot for <span className="text-foreground">{w.title}</span> on {format(new Date(w.scheduled_at), "dd MMM, HH:mm")}. We'll send a reminder 24 hours and 1 hour before it starts.
              </p>
              {w.join_url && (
                <a href={w.join_url} target="_blank" rel="noreferrer">
                  <Button className="w-full bg-gradient-gold text-background shadow-gold">
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />Save the join link
                  </Button>
                </a>
              )}
              <div className="border-t border-border/40 pt-4">
                <p className="mb-3 text-xs text-muted-foreground">Help a friend grab a seat too</p>
                <ShareButtons
                  url={typeof window !== "undefined" ? window.location.href.split("?")[0] : ""}
                  title={`Free webinar: ${w.title}`}
                  text={`I just registered for "${w.title}" on ${format(new Date(w.scheduled_at), "dd MMM, HH:mm")}. Join me!`}
                  variant="compact"
                  className="justify-center"
                />
              </div>
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
          ) : isFull ? (
            <div className="text-center">
              <h2 className="font-display text-xl">Sold out</h2>
              <p className="mt-2 text-sm text-muted-foreground">All {w.capacity} seats have been taken. Check back later in case of cancellations.</p>
            </div>
          ) : (
            <>
              <h2 className="font-display text-2xl">Reserve your seat</h2>
              <p className="mt-1 text-sm text-muted-foreground">It's free. Takes 30 seconds.</p>
              {joinOpen && (
                <a href={w.join_url ?? "#"} target="_blank" rel="noreferrer" className="mt-3 block">
                  <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    <span>Already registered? Session starts soon — join now.</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </div>
                </a>
              )}
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
