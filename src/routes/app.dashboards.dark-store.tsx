import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";

export const Route = createFileRoute("/app/dashboards/dark-store")({
  head: () => ({ meta: [{ title: "Dark Store Dashboard — MMA Suite" }] }),
  component: DarkStoreDash,
});

function DarkStoreDash() {
  const whQ = useQuery({ queryKey: ["dash-warehouses"], queryFn: async () => (await supabase.from("warehouses").select("id,name,code,city,state,franchisee_id,active,type").eq("type", "dark_store")).data });
  const stockQ = useQuery({ queryKey: ["dash-stock"], queryFn: async () => (await supabase.from("stock_levels").select("warehouse_id,quantity,product_id,products(name,price)").limit(2000)).data });
  const salesQ = useQuery({ queryKey: ["dash-sales"], queryFn: async () => (await supabase.from("sales_orders").select("warehouse_id,grand_total,amount_paid,status,created_at").limit(1000)).data });

  const wh = whQ.data ?? [];
  const stock = stockQ.data ?? [];
  const sales = salesQ.data ?? [];

  const totalSales = sales.reduce((s, o) => s + Number(o.grand_total), 0);
  const totalPaid = sales.reduce((s, o) => s + Number(o.amount_paid), 0);
  const totalStock = stock.reduce((s, r) => s + Number(r.quantity), 0);
  const lowStock = stock.filter((r) => Number(r.quantity) < 5).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Dark Stores" value={`${wh.length}`} />
        <Kpi label="Total Sales" value={formatINR(totalSales)} />
        <Kpi label="Collected" value={formatINR(totalPaid)} />
        <Kpi label="Low Stock SKUs" value={`${lowStock}`} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Stores Overview</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>City</TableHead><TableHead>SKUs</TableHead><TableHead>Stock Qty</TableHead><TableHead>Sales</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {wh.map((w) => {
                const wStock = stock.filter((s) => s.warehouse_id === w.id);
                const wSales = sales.filter((s) => s.warehouse_id === w.id).reduce((a, b) => a + Number(b.grand_total), 0);
                return (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono text-xs">{w.code}</TableCell>
                    <TableCell>{w.name}</TableCell>
                    <TableCell>{w.city ?? "—"}, {w.state ?? "—"}</TableCell>
                    <TableCell>{wStock.length}</TableCell>
                    <TableCell>{wStock.reduce((a, b) => a + Number(b.quantity), 0)}</TableCell>
                    <TableCell>{formatINR(wSales)}</TableCell>
                    <TableCell><Badge variant={w.active ? "default" : "secondary"}>{w.active ? "active" : "off"}</Badge></TableCell>
                  </TableRow>
                );
              })}
              {wh.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No dark stores</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Stock Snapshot ({totalStock.toLocaleString()} units)</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">{stock.length} SKU rows across {wh.length} warehouses.</p></CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl">{value}</p></CardContent></Card>;
}
