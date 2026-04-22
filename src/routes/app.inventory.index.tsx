import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, Warehouse, AlertTriangle, TrendingUp, FileText, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/app/KpiCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";

export const Route = createFileRoute("/app/inventory/")({
  component: InventoryOverview,
});

function InventoryOverview() {
  const stats = useQuery({
    queryKey: ["inv-stats"],
    queryFn: async () => {
      const [products, warehouses, suppliers, pos, stock] = await Promise.all([
        supabase.from("products").select("id, cost_price, low_stock_threshold, active"),
        supabase.from("warehouses").select("id, active"),
        supabase.from("suppliers").select("id, active"),
        supabase.from("purchase_orders").select("id, status, total_amount"),
        supabase.from("stock_levels").select("product_id, quantity, products(low_stock_threshold, cost_price)"),
      ]);
      const stockRows = stock.data ?? [];
      const inventoryValue = stockRows.reduce((s: number, r: any) => s + Number(r.quantity ?? 0) * Number(r.products?.cost_price ?? 0), 0);
      const lowStock = stockRows.filter((r: any) => Number(r.quantity ?? 0) <= Number(r.products?.low_stock_threshold ?? 0)).length;
      const openPOs = (pos.data ?? []).filter((p: any) => p.status === "draft" || p.status === "sent" || p.status === "partially_received");
      const openPOValue = openPOs.reduce((s: number, p: any) => s + Number(p.total_amount ?? 0), 0);
      return {
        products: (products.data ?? []).filter((p: any) => p.active).length,
        warehouses: (warehouses.data ?? []).filter((w: any) => w.active).length,
        suppliers: (suppliers.data ?? []).filter((s: any) => s.active).length,
        inventoryValue,
        lowStock,
        openPOs: openPOs.length,
        openPOValue,
      };
    },
  });

  const recentMovements = useQuery({
    queryKey: ["inv-recent-movements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku)")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active Products" value={String(stats.data?.products ?? 0)} icon={Package} delay={0} />
        <KpiCard label="Warehouses" value={String(stats.data?.warehouses ?? 0)} icon={Warehouse} delay={0.05} />
        <KpiCard label="Inventory Value" value={formatINR(stats.data?.inventoryValue ?? 0)} icon={TrendingUp} delay={0.1} />
        <KpiCard label="Low Stock Items" value={String(stats.data?.lowStock ?? 0)} icon={AlertTriangle} delay={0.15} />
        <KpiCard label="Suppliers" value={String(stats.data?.suppliers ?? 0)} icon={Truck} delay={0.2} />
        <KpiCard label="Open POs" value={String(stats.data?.openPOs ?? 0)} icon={FileText} delay={0.25} />
        <KpiCard label="Open PO Value" value={formatINR(stats.data?.openPOValue ?? 0)} icon={TrendingUp} delay={0.3} />
      </div>

      <Card className="glass p-5">
        <h2 className="mb-3 font-display text-lg">Recent Stock Movements</h2>
        <div className="space-y-2">
          {(recentMovements.data ?? []).map((m: any) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3">
              <div>
                <div className="font-medium">{m.products?.name}</div>
                <div className="text-xs text-muted-foreground">SKU: {m.products?.sku} · {new Date(m.created_at).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="border-primary/40 text-primary capitalize">{m.movement_type.replace("_", " ")}</Badge>
                <span className="font-mono text-sm">{Number(m.quantity).toFixed(2)}</span>
              </div>
            </div>
          ))}
          {recentMovements.data?.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">No movements recorded yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
