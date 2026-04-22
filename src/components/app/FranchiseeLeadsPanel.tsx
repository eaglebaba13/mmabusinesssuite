import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Users, Phone, Mail, MapPin, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { exportLeadsCsv } from "@/lib/leads-export";

interface Props {
  territoryId: string | null;
  franchiseeName?: string;
}

const STAGES = ["new", "contacted", "qualified", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];

const stageColor: Record<string, string> = {
  new: "border-sky-500/40 text-sky-400",
  contacted: "border-amber-500/40 text-amber-400",
  qualified: "border-violet-500/40 text-violet-400",
  won: "border-emerald-500/40 text-emerald-400",
  lost: "border-rose-500/40 text-rose-400",
};

export function FranchiseeLeadsPanel({ territoryId, franchiseeName = "franchisee" }: Props) {
  const { isAdmin } = useAuth();
  const [stageFilter, setStageFilter] = React.useState<Stage | "all">("all");
  const [openLead, setOpenLead] = React.useState<any | null>(null);
  const [syncing, setSyncing] = React.useState(false);

  const { data: lastSync } = useQuery({
    queryKey: ["fr-last-sync", territoryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("social_integrations")
        .select("last_sync_at")
        .order("last_sync_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      return data?.last_sync_at ?? null;
    },
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["fr-leads", territoryId],
    enabled: !!territoryId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, full_name, email, phone, city, source, stage, score, created_at")
        .eq("territory_id", territoryId!)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["fr-lead-activities", openLead?.id],
    enabled: !!openLead?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", openLead.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    for (const s of STAGES) c[s] = 0;
    for (const l of leads) c[l.stage] = (c[l.stage] ?? 0) + 1;
    return c;
  }, [leads]);

  const filtered = stageFilter === "all" ? leads : leads.filter((l) => l.stage === stageFilter);

  if (!territoryId) {
    return (
      <div className="rounded-2xl glass p-8 text-center text-sm text-muted-foreground">
        No territory assigned yet. Ask admin to assign your territory to see incoming leads.
      </div>
    );
  }

  const onSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-ad-leads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: "{}",
        },
      );
      if (!res.ok) throw new Error("Sync failed");
      toast.success("Sync triggered");
    } catch (e: any) {
      toast.error(e.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl glass p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gold" />
            <h3 className="font-display text-lg">My Leads</h3>
            {lastSync && (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                Last synced {formatDistanceToNow(new Date(lastSync), { addSuffix: true })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{leads.length} in your territory</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportLeadsCsv(filtered, franchiseeName)}
              disabled={filtered.length === 0}
            >
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
            {isAdmin && (
              <Button size="sm" variant="ghost" onClick={onSyncNow} disabled={syncing}>
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip active={stageFilter === "all"} onClick={() => setStageFilter("all")}>
            All · {counts.all}
          </FilterChip>
          {STAGES.map((s) => (
            <FilterChip key={s} active={stageFilter === s} onClick={() => setStageFilter(s)}>
              <span className="capitalize">{s}</span> · {counts[s]}
            </FilterChip>
          ))}
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No leads in this stage.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-left">Phone</th>
                  <th className="px-2 py-2 text-left">City</th>
                  <th className="px-2 py-2 text-left">Source</th>
                  <th className="px-2 py-2 text-center">Stage</th>
                  <th className="px-2 py-2 text-center">Score</th>
                  <th className="px-2 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr
                    key={l.id}
                    className="cursor-pointer border-b border-border/40 transition-colors hover:bg-card/40"
                    onClick={() => setOpenLead(l)}
                  >
                    <td className="px-2 py-2 font-medium">{l.full_name}</td>
                    <td className="px-2 py-2 text-muted-foreground">{l.phone ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{l.city ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground capitalize">{l.source}</td>
                    <td className="px-2 py-2 text-center">
                      <Badge variant="outline" className={`${stageColor[l.stage] ?? ""} capitalize`}>
                        {l.stage}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-center text-muted-foreground">{l.score ?? 0}</td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {format(new Date(l.created_at), "dd MMM yy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-display">{openLead?.full_name}</SheetTitle>
          </SheetHeader>
          {openLead && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2 text-sm">
                {openLead.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {openLead.phone}
                  </div>
                )}
                {openLead.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {openLead.email}
                  </div>
                )}
                {openLead.city && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {openLead.city}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                  <Badge variant="outline" className={`${stageColor[openLead.stage] ?? ""} capitalize`}>
                    {openLead.stage}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {openLead.source}
                  </Badge>
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-display text-sm uppercase tracking-wider text-muted-foreground">
                  Activity timeline
                </h4>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {activities.map((a: any) => (
                      <div key={a.id} className="rounded-lg bg-background/40 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">{a.activity_type}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(a.created_at), "dd MMM HH:mm")}
                          </span>
                        </div>
                        {a.content && <p className="mt-1 text-muted-foreground">{a.content}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={
        active
          ? "border-gold/60 bg-gold/10 text-gold hover:bg-gold/20"
          : "border-border/60 text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </Button>
  );
}
