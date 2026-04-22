import { useQuery } from "@tanstack/react-query";
import { Megaphone, ExternalLink, CircleDot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Props {
  franchiseeId: string;
  territoryId: string | null;
}

const sourceColor: Record<string, string> = {
  meta: "border-blue-500/40 text-blue-400",
  facebook: "border-blue-500/40 text-blue-400",
  instagram: "border-pink-500/40 text-pink-400",
  google: "border-amber-500/40 text-amber-400",
};

export function ActiveCampaignsGrid({ franchiseeId, territoryId }: Props) {
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["ad-campaigns", franchiseeId, territoryId],
    queryFn: async () => {
      let query = supabase
        .from("ad_campaigns")
        .select("*")
        .order("last_synced_at", { ascending: false, nullsFirst: false })
        .limit(60);
      if (territoryId) {
        query = query.or(
          `franchisee_id.eq.${franchiseeId},territory_id.eq.${territoryId}`,
        );
      } else {
        query = query.eq("franchisee_id", franchiseeId);
      }
      const { data } = await query;
      return data ?? [];
    },
  });

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-gold" />
          <h3 className="font-display text-lg">Active campaigns</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {campaigns.length} live
        </span>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No active campaigns running. Connect ad accounts in Settings → Social to auto-import.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background/40 transition-colors hover:border-gold/40"
            >
              {c.preview_url ? (
                <div className="aspect-video overflow-hidden bg-card">
                  <img
                    src={c.preview_url}
                    alt={c.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center bg-card">
                  <Megaphone className="h-10 w-10 text-muted-foreground/30" />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={`${sourceColor[c.source.toLowerCase()] ?? "border-gold/40 text-gold"} capitalize`}
                  >
                    {c.source}
                  </Badge>
                  <span
                    className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${
                      c.status === "active"
                        ? "text-emerald-400"
                        : c.status === "paused"
                          ? "text-amber-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    <CircleDot className="h-3 w-3" /> {c.status}
                  </span>
                </div>
                <div className="font-medium text-sm leading-tight">{c.name}</div>
                {c.headline && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {c.headline}
                  </p>
                )}
                {c.body && (
                  <p className="text-[11px] text-muted-foreground/80 line-clamp-2">
                    {c.body.slice(0, 80)}
                    {c.body.length > 80 ? "…" : ""}
                  </p>
                )}
                {c.cta_url && (
                  <a
                    href={c.cta_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-auto inline-flex items-center gap-1 text-xs text-gold hover:underline"
                  >
                    View on platform <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
