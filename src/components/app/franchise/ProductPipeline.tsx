import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Users, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

type Lead = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  stage: string;
  interest_stage: string | null;
  score: number | null;
  budget: number | null;
  created_at: string;
};

const STAGES = [
  { key: "interested", label: "Interested", tone: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  { key: "shortlisted", label: "Shortlisted", tone: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  { key: "negotiating", label: "Negotiating", tone: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
  { key: "won", label: "Won", tone: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  { key: "lost", label: "Lost", tone: "bg-red-500/10 text-red-400 border-red-500/30" },
] as const;

export function ProductPipeline({ productId, productName }: { productId: string; productName: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["product-pipeline", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, email, phone, city, stage, interest_stage, score, budget, created_at")
        .eq("franchise_product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const setStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from("leads").update({ interest_stage: stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stage updated");
      qc.invalidateQueries({ queryKey: ["product-pipeline", productId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const grouped = React.useMemo(() => {
    const g: Record<string, Lead[]> = {};
    for (const s of STAGES) g[s.key] = [];
    for (const l of leads) {
      const k = l.interest_stage ?? "interested";
      (g[k] ?? g.interested).push(l);
    }
    return g;
  }, [leads]);

  if (isLoading) return <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>;

  if (leads.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No leads linked to this product yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tag a lead with this product from the Leads page to see it here.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {STAGES.map((s) => (
        <div key={s.key} className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</h4>
            <span className="text-xs text-muted-foreground">{grouped[s.key].length}</span>
          </div>
          <div className="space-y-2">
            {grouped[s.key].map((l) => (
              <Card key={l.id} className={`border ${s.tone} p-3`}>
                <div className="text-sm font-medium">{l.full_name}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {l.email ?? l.phone ?? "—"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {l.city && <Badge variant="outline" className="text-[10px]">{l.city}</Badge>}
                  {l.score != null && <Badge variant="outline" className="text-[10px] text-gold">{l.score}</Badge>}
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {format(new Date(l.created_at), "dd MMM")}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <select
                    value={l.interest_stage ?? "interested"}
                    onChange={(e) => setStage.mutate({ id: l.id, stage: e.target.value })}
                    className="h-7 flex-1 rounded-md border border-border bg-card/40 px-1 text-[11px]"
                  >
                    {STAGES.map((x) => (
                      <option key={x.key} value={x.key}>{x.label}</option>
                    ))}
                  </select>
                  {s.key !== "won" && s.key !== "lost" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      title="Convert to franchisee"
                      onClick={() =>
                        navigate({
                          to: "/app/franchisees",
                          search: {
                            openOnboard: 1,
                            productId,
                            leadId: l.id,
                            fullName: l.full_name,
                            email: l.email ?? "",
                            phone: l.phone ?? "",
                          } as any,
                        })
                      }
                    >
                      <Sparkles className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {grouped[s.key].length === 0 && (
              <div className="rounded-md border border-dashed border-border/40 p-3 text-center text-[11px] text-muted-foreground/60">
                Empty
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="lg:col-span-5">
        <p className="text-xs text-muted-foreground">
          Product: <span className="text-foreground">{productName}</span> · Move leads through stages, then click{" "}
          <ArrowRight className="inline h-3 w-3" /> to open the onboarding wizard prefilled.
        </p>
      </div>
    </div>
  );
}
