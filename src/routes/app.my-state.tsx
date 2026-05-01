import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Building2, IndianRupee, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { KpiCard } from "@/components/app/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatINR, formatINRCompact } from "@/lib/format";

export const Route = createFileRoute("/app/my-state")({
  head: () => ({ meta: [{ title: "My State — MMA Suite" }] }),
  component: MyStatePage,
});

function MyStatePage() {
  const { user } = useAuth();

  const { data: sf, isLoading } = useQuery({
    queryKey: ["my-state", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const byUser = await (supabase as any).from("state_franchises").select("*").eq("user_id", user!.id).maybeSingle();
      if (byUser.data) return byUser.data;
      if (user?.email) {
        const byEmail = await (supabase as any).from("state_franchises").select("*").ilike("email", user.email).maybeSingle();
        return byEmail.data;
      }
      return null;
    },
  });

  const { data: territories = [] } = useQuery({
    queryKey: ["my-state-territories", sf?.id],
    enabled: !!sf?.id,
    queryFn: async () => {
      const { data } = await supabase.from("territories").select("*").eq("state_franchise_id" as any, sf.id);
      return (data ?? []) as any[];
    },
  });

  const territoryIds = territories.map((t: any) => t.id);

  const { data: franchisees = [] } = useQuery({
    queryKey: ["my-state-franchisees", territoryIds.join(",")],
    enabled: territoryIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("franchisees").select("*").in("territory_id", territoryIds);
      return (data ?? []) as any[];
    },
  });

  const franchiseeIds = franchisees.map((f: any) => f.id);

  const { data: orders = [] } = useQuery({
    queryKey: ["my-state-orders", franchiseeIds.join(",")],
    enabled: franchiseeIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_orders")
        .select("id, grand_total, status, completed_at, franchisee_id, invoice_number")
        .in("franchisee_id", franchiseeIds)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as any[];
    },
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["my-state-leads", territoryIds.join(",")],
    enabled: territoryIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("id, full_name, stage, created_at, territory_id").in("territory_id", territoryIds).order("created_at", { ascending: false }).limit(200);
      return (data ?? []) as any[];
    },
  });

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  if (!sf) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <h1 className="font-display text-3xl">No state franchise on record</h1>
        <p className="mt-2 text-muted-foreground">Contact your account manager to link your state franchise profile.</p>
      </div>
    );
  }

  const totalSales = orders.filter((o) => o.status === "completed").reduce((s, o) => s + Number(o.grand_total ?? 0), 0);
  const commission = totalSales * (Number(sf.state_partner_pct ?? 10) / 100);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-gold">State Franchise</p>
        <h1 className="mt-1 font-display text-3xl">{sf.full_name}</h1>
        <p className="text-sm text-muted-foreground">{sf.state}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Cities" value={String(territories.length)} icon={MapPin} />
        <KpiCard label="Franchisees" value={String(franchisees.length)} icon={Building2} />
        <KpiCard label="Total sales" value={formatINRCompact(totalSales)} icon={IndianRupee} />
        <KpiCard label={`Commission (${sf.state_partner_pct}%)`} value={formatINRCompact(commission)} icon={TrendingUp} />
      </div>

      <Tabs defaultValue="franchisees" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="franchisees">Franchisees</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
        </TabsList>

        <TabsContent value="franchisees" className="mt-4 space-y-2">
          {franchisees.length === 0 && <p className="rounded-2xl glass p-6 text-center text-sm text-muted-foreground">No city franchisees yet.</p>}
          {franchisees.map((f: any) => (
            <div key={f.id} className="flex items-center justify-between rounded-xl glass p-4">
              <div>
                <div className="font-display">{f.full_name}</div>
                <div className="text-xs text-muted-foreground">{f.email ?? f.phone ?? "—"}</div>
              </div>
              <Badge variant="outline" className="border-gold/40 text-gold capitalize">{f.status}</Badge>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <div className="rounded-2xl glass overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Invoice</th>
                  <th className="p-3 text-left">Franchisee</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Your share</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const f = franchisees.find((x: any) => x.id === o.franchisee_id);
                  const share = Number(o.grand_total) * (Number(sf.state_partner_pct) / 100);
                  return (
                    <tr key={o.id} className="border-t border-border">
                      <td className="p-3 font-mono text-xs">{o.invoice_number ?? o.id.slice(0, 8)}</td>
                      <td className="p-3">{f?.full_name ?? "—"}</td>
                      <td className="p-3 capitalize">{o.status}</td>
                      <td className="p-3 text-right">{formatINR(Number(o.grand_total))}</td>
                      <td className="p-3 text-right text-gold">{o.status === "completed" ? formatINR(share) : "—"}</td>
                    </tr>
                  );
                })}
                {orders.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No sales yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="leads" className="mt-4 space-y-2">
          {leads.length === 0 && <p className="rounded-2xl glass p-6 text-center text-sm text-muted-foreground">No leads in your territories yet.</p>}
          {leads.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between rounded-xl glass p-4">
              <div>
                <div className="font-display">{l.full_name}</div>
                <div className="text-xs text-muted-foreground capitalize">{l.stage}</div>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
