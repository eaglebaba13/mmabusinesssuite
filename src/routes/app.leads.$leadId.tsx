import * as React from "react";
import { createFileRoute, Link, useParams, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatINRCompact } from "@/lib/format";
import { format } from "date-fns";

export const Route = createFileRoute("/app/leads/$leadId")({
  head: () => ({ meta: [{ title: "Lead — MMA Suite" }] }),
  component: LeadDetailPage,
  errorComponent: ({ error, reset }) => {
    if (import.meta.env.DEV) console.error(error);
    return (
      <div className="p-12 text-center">
        <p className="text-destructive">Something went wrong. Please try again.</p>
        <Button onClick={reset} className="mt-4">Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="p-12 text-center">
      <p>Lead not found.</p>
      <Link to="/app/leads" className="mt-4 inline-block text-gold underline">Back to leads</Link>
    </div>
  ),
});

function LeadDetailPage() {
  const { leadId } = useParams({ from: "/app/leads/$leadId" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [note, setNote] = React.useState("");
  const [scoring, setScoring] = React.useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["franchise_products_active_leads"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_products")
        .select("id, name, brand_name")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; brand_name: string | null }>;
    },
  });

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["lead-activities", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("lead_activities").insert({
        lead_id: leadId,
        user_id: user?.id,
        activity_type: "note",
        content: note,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      toast.success("Note added");
      qc.invalidateQueries({ queryKey: ["lead-activities", leadId] });
    },
  });

  const scoreLead = async () => {
    if (!lead) return;
    setScoring(true);
    // Heuristic AI scoring (lightweight, deterministic) — Phase 2 will wire to AI Gateway
    let score = 30;
    if (lead.email) score += 15;
    if (lead.phone) score += 20;
    if (lead.budget && Number(lead.budget) > 100000) score += 25;
    if (lead.source === "referral") score += 15;
    if (lead.source === "webinar") score += 10;
    if (lead.city) score += 5;
    score = Math.min(100, score);
    const { error } = await supabase.from("leads").update({ score }).eq("id", leadId);
    setScoring(false);
    if (error) {
      console.error(error);
      return toast.error("Failed to score lead. Please try again.");
    }
    toast.success(`Lead scored: ${score}/100`);
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
  };

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (!lead) return null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <Link to="/app/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      <div className="rounded-2xl glass p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl">{lead.full_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{lead.email ?? "—"} · {lead.phone ?? "—"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-gold/40 text-gold capitalize">{lead.stage.replace("_", " ")}</Badge>
              <Badge variant="outline" className="capitalize">{lead.source}</Badge>
              {lead.ad_name && (
                <Badge variant="outline" className="max-w-[280px] truncate" title={lead.ad_name}>
                  📣 {lead.ad_name}
                </Badge>
              )}
              {lead.city && <Badge variant="outline">{lead.city}</Badge>}
              {lead.budget && <Badge variant="outline" className="text-gold">{formatINRCompact(Number(lead.budget))}</Badge>}
            </div>
          </div>
          <div className="text-right">
            {lead.score ? (
              <div className="rounded-xl glass-strong px-5 py-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Lead score</div>
                <div className="font-display text-3xl text-gradient-gold">{lead.score}/100</div>
              </div>
            ) : null}
            <Button onClick={scoreLead} disabled={scoring} className="mt-3 bg-gradient-gold text-background">
              <Sparkles className="mr-1 h-4 w-4" />{scoring ? "Scoring…" : "AI score"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl glass p-6">
        <h3 className="font-display text-xl">Activity</h3>
        <div className="mt-4 space-y-3">
          <Textarea
            placeholder="Add note, call summary, follow-up reminder…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-[80px] bg-background/40"
          />
          <Button onClick={() => addNote.mutate()} disabled={!note.trim() || addNote.isPending} className="bg-gradient-gold text-background">
            Add note
          </Button>
        </div>
        <div className="mt-6 space-y-3">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activities yet.</p>
          ) : (
            activities.map((a) => (
              <div key={a.id} className="border-l-2 border-gold/40 pl-4">
                <div className="text-xs text-muted-foreground">{format(new Date(a.created_at), "MMM d, yyyy · HH:mm")}</div>
                <div className="mt-0.5 text-sm">{a.content}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
