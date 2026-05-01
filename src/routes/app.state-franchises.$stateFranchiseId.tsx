import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Key, Building2, IndianRupee, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/app/KpiCard";
import { formatINR, formatINRCompact } from "@/lib/format";
import { resetStateFranchisePassword } from "@/server/state-franchise-user.functions";

export const Route = createFileRoute("/app/state-franchises/$stateFranchiseId")({
  head: () => ({ meta: [{ title: "State Franchise — MMA Suite" }] }),
  component: StateFranchiseDetail,
});

function StateFranchiseDetail() {
  const { stateFranchiseId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const resetFn = useServerFn(resetStateFranchisePassword);

  const { data: sf } = useQuery({
    queryKey: ["state-franchise", stateFranchiseId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("state_franchises").select("*").eq("id", stateFranchiseId).maybeSingle();
      return data as any;
    },
  });

  const { data: territories = [] } = useQuery({
    queryKey: ["sf-territories", stateFranchiseId],
    queryFn: async () => {
      const { data } = await supabase.from("territories").select("*").eq("state_franchise_id" as any, stateFranchiseId);
      return (data ?? []) as any[];
    },
  });

  const territoryIds = territories.map((t: any) => t.id);

  const { data: franchisees = [] } = useQuery({
    queryKey: ["sf-franchisees", territoryIds.join(",")],
    enabled: territoryIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("franchisees").select("*").in("territory_id", territoryIds);
      return (data ?? []) as any[];
    },
  });

  const franchiseeIds = franchisees.map((f: any) => f.id);

  const { data: orders = [] } = useQuery({
    queryKey: ["sf-orders", franchiseeIds.join(",")],
    enabled: franchiseeIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_orders")
        .select("id, grand_total, status, completed_at, franchisee_id, invoice_number")
        .in("franchisee_id", franchiseeIds)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
  });

  const totalSales = orders.filter((o) => o.status === "completed").reduce((s, o) => s + Number(o.grand_total ?? 0), 0);
  const commission = totalSales * (Number(sf?.state_partner_pct ?? 10) / 100);

  const reset = useMutation({
    mutationFn: async () => {
      const r: any = await resetFn({ data: { state_franchise_id: stateFranchiseId } });
      return r;
    },
    onSuccess: (r: any) => {
      toast.success("New password generated");
      navigator.clipboard.writeText(r.password);
      toast.message("Password copied to clipboard");
    },
    onError: (e: any) => toast.error(e.message || "Reset failed"),
  });

  if (!sf) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/state-franchises" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">State Franchise</p>
          <h1 className="mt-1 font-display text-3xl">{sf.full_name}</h1>
          <p className="text-sm text-muted-foreground">{sf.state} · {sf.email ?? sf.phone ?? "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-gold/40 text-gold capitalize">{sf.status}</Badge>
          {sf.user_id && (
            <Button variant="outline" size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}>
              <Key className="mr-1 h-3.5 w-3.5" /> {reset.isPending ? "…" : "Reset password"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Cities" value={String(territories.length)} icon={MapPin} />
        <KpiCard label="Franchisees" value={String(franchisees.length)} icon={Building2} />
        <KpiCard label="Total sales" value={formatINRCompact(totalSales)} icon={IndianRupee} />
        <KpiCard label={`Commission (${sf.state_partner_pct}%)`} value={formatINRCompact(commission)} icon={TrendingUp} />
      </div>

      <Tabs defaultValue="territories" className="w-full">
        <TabsList>
          <TabsTrigger value="territories">Territories</TabsTrigger>
          <TabsTrigger value="franchisees">Franchisees</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
        </TabsList>

        <TabsContent value="territories" className="mt-4 space-y-2">
          {territories.length === 0 && <p className="text-sm text-muted-foreground rounded-2xl glass p-6">No territories assigned yet.</p>}
          {territories.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl glass p-4">
              <div>
                <div className="font-display">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.state}{t.region ? ` · ${t.region}` : ""}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={async () => {
                const { error } = await (supabase as any).from("territories").update({ state_franchise_id: null }).eq("id", t.id);
                if (error) { toast.error(error.message); return; }
                toast.success("Territory unassigned");
                qc.invalidateQueries({ queryKey: ["sf-territories"] });
              }}>Unassign</Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="franchisees" className="mt-4 space-y-2">
          {franchisees.length === 0 && <p className="text-sm text-muted-foreground rounded-2xl glass p-6">No city franchisees in this state's territories yet.</p>}
          {franchisees.map((f: any) => (
            <Link
              key={f.id}
              to="/app/franchisees/$franchiseeId"
              params={{ franchiseeId: f.id }}
              className="flex items-center justify-between rounded-xl glass p-4 hover-gold-glow"
            >
              <div>
                <div className="font-display">{f.full_name}</div>
                <div className="text-xs text-muted-foreground">{f.email ?? f.phone ?? "—"}</div>
              </div>
              <Badge variant="outline" className="border-gold/40 text-gold capitalize">{f.status}</Badge>
            </Link>
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
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const f = franchisees.find((x: any) => x.id === o.franchisee_id);
                  return (
                    <tr key={o.id} className="border-t border-border">
                      <td className="p-3 font-mono text-xs">{o.invoice_number ?? o.id.slice(0, 8)}</td>
                      <td className="p-3">{f?.full_name ?? "—"}</td>
                      <td className="p-3 capitalize">{o.status}</td>
                      <td className="p-3 text-right">{formatINR(Number(o.grand_total))}</td>
                    </tr>
                  );
                })}
                {orders.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No sales yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
