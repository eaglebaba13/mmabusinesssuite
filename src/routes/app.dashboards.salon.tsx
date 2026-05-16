import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import { OpenDashboardButton } from "@/components/app/OpenDashboardButton";

export const Route = createFileRoute("/app/dashboards/salon")({
  head: () => ({ meta: [{ title: "Salon Branches — MMA Suite" }] }),
  component: SalonDash,
});

function SalonDash() {
  const brQ = useQuery({ queryKey: ["dash-salons"], queryFn: async () => (await supabase.from("salon_branches").select("*").order("name")).data });
  const ordQ = useQuery({ queryKey: ["dash-salon-orders"], queryFn: async () => (await supabase.from("sales_orders").select("salon_branch_id,grand_total,amount_paid,created_at").not("salon_branch_id", "is", null).limit(1000)).data });

  const branches = brQ.data ?? [];
  const orders = ordQ.data ?? [];
  const totalRevenue = orders.reduce((s, o) => s + Number(o.grand_total), 0);
  const totalCollected = orders.reduce((s, o) => s + Number(o.amount_paid), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Salon Branches" value={`${branches.length}`} />
        <Kpi label="Active" value={`${branches.filter((b) => b.status === "active").length}`} />
        <Kpi label="Service Revenue" value={formatINR(totalRevenue)} />
        <Kpi label="Collected" value={formatINR(totalCollected)} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Branches</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Brand</TableHead><TableHead>Location</TableHead><TableHead>Services</TableHead><TableHead>Revenue</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {branches.map((b) => {
                const bOrders = orders.filter((o) => o.salon_branch_id === b.id);
                const bRev = bOrders.reduce((a, o) => a + Number(o.grand_total), 0);
                const services = Array.isArray(b.service_catalog) ? b.service_catalog.length : 0;
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.code ?? "—"}</TableCell>
                    <TableCell>{b.name}</TableCell>
                    <TableCell className="capitalize">{b.parent_brand?.replace("_", " ")}</TableCell>
                    <TableCell>{b.city ?? "—"}, {b.state ?? "—"}</TableCell>
                    <TableCell>{services}</TableCell>
                    <TableCell>{formatINR(bRev)}</TableCell>
                    <TableCell><Badge variant={b.status === "active" ? "default" : "secondary"}>{b.status}</Badge></TableCell>
                    <TableCell><OpenDashboardButton entity_type="salon_branch" entity_id={b.id} label="Open" /></TableCell>
                  </TableRow>
                );
              })}
              {branches.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No salon branches</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl">{value}</p></CardContent></Card>;
}
