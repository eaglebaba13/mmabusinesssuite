import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Megaphone, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Props {
  territoryId: string | null;
  franchiseeId: string;
}

export function FranchiseeCampaignsPanel({ territoryId, franchiseeId }: Props) {
  const since = subDays(new Date(), 30).toISOString();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["fr-social-events", franchiseeId, territoryId],
    queryFn: async () => {
      // Direct franchisee match OR territory-scoped via leads relation
      const { data } = await supabase
        .from("social_lead_events")
        .select("id, source, campaign, status, created_at, lead_id, assigned_franchisee_id")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  // Filter to events relevant to this franchisee
  const myEvents = events.filter(
    (e) => e.assigned_franchisee_id === franchiseeId || (territoryId && e.lead_id),
  );

  // Group by source
  const bySource = new Map<string, { total: number; converted: number; campaigns: Set<string> }>();
  myEvents.forEach((e) => {
    const src = (e.source || "unknown").toLowerCase();
    const cur = bySource.get(src) ?? { total: 0, converted: 0, campaigns: new Set<string>() };
    cur.total += 1;
    if (e.lead_id) cur.converted += 1;
    if (e.campaign) cur.campaigns.add(e.campaign);
    bySource.set(src, cur);
  });

  const sourceRows = Array.from(bySource.entries())
    .map(([source, s]) => ({
      source,
      total: s.total,
      converted: s.converted,
      campaigns: s.campaigns.size,
      conversion: s.total > 0 ? (s.converted / s.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const totalLeads = myEvents.filter((e) => e.lead_id).length;
  const totalEvents = myEvents.length;
  const overallConv = totalEvents > 0 ? (totalLeads / totalEvents) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl glass p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-gold" />
            <h3 className="font-display text-lg">My Ads & Campaigns</h3>
          </div>
          <span className="text-xs text-muted-foreground">Last 30 days</span>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Total ad events" value={String(totalEvents)} />
          <Stat label="Leads generated" value={String(totalLeads)} />
          <Stat label="Conversion rate" value={`${overallConv.toFixed(1)}%`} accent />
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : sourceRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No ad events tracked in the last 30 days. Once campaigns start delivering leads, they will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Source</th>
                  <th className="px-2 py-2 text-center">Campaigns</th>
                  <th className="px-2 py-2 text-center">Events</th>
                  <th className="px-2 py-2 text-center">Leads</th>
                  <th className="px-2 py-2 text-right">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((r) => (
                  <tr key={r.source} className="border-b border-border/40">
                    <td className="px-2 py-2">
                      <Badge variant="outline" className="border-gold/40 text-gold capitalize">
                        {r.source}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-center text-muted-foreground">{r.campaigns}</td>
                    <td className="px-2 py-2 text-center">{r.total}</td>
                    <td className="px-2 py-2 text-center font-medium text-emerald-400">{r.converted}</td>
                    <td className="px-2 py-2 text-right">
                      <span className="font-display text-gold">{r.conversion.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl glass p-5">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-gold" />
          <h3 className="font-display text-lg">Recent ad events</h3>
        </div>
        {myEvents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No recent events.</p>
        ) : (
          <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
            {myEvents.slice(0, 30).map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-lg bg-background/40 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="border-gold/40 text-gold capitalize">
                    {e.source}
                  </Badge>
                  <span className="text-muted-foreground">{e.campaign ?? "—"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={
                      e.lead_id
                        ? "border-emerald-500/40 text-emerald-400"
                        : "border-amber-500/40 text-amber-400"
                    }
                  >
                    {e.lead_id ? "converted" : e.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(e.created_at), "dd MMM HH:mm")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-background/40 p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl ${accent ? "text-gradient-gold" : ""}`}>{value}</div>
    </div>
  );
}
