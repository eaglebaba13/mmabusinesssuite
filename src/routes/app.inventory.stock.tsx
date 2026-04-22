import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const Route = createFileRoute("/app/inventory/stock")({
  component: StockLevelsPage,
});

function StockLevelsPage() {
  const [search, setSearch] = React.useState("");
  const [warehouse, setWarehouse] = React.useState<string>("all");

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("*").order("name");
      return data ?? [];
    },
  });

  const stock = useQuery({
    queryKey: ["stock-levels"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_levels")
        .select("*, products(name, sku, low_stock_threshold, unit), warehouses(name, code, type)")
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const rows = (stock.data ?? []).filter((r: any) => {
    if (warehouse !== "all" && r.warehouse_id !== warehouse) return false;
    if (search && !`${r.products?.name} ${r.products?.sku}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search product…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={warehouse} onValueChange={setWarehouse}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All warehouses</SelectItem>
            {(warehouses.data ?? []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow><TableHead>SKU</TableHead><TableHead>Product</TableHead><TableHead>Warehouse</TableHead><TableHead className="text-right">On Hand</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any) => {
              const qty = Number(r.quantity);
              const threshold = Number(r.products?.low_stock_threshold ?? 0);
              const low = qty <= threshold;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.products?.sku}</TableCell>
                  <TableCell className="font-medium">{r.products?.name}</TableCell>
                  <TableCell><Badge variant="outline" className="border-primary/40 text-primary">{r.warehouses?.code}</Badge> <span className="ml-1 text-xs text-muted-foreground">{r.warehouses?.name}</span></TableCell>
                  <TableCell className="text-right font-mono">{qty.toFixed(2)} {r.products?.unit}</TableCell>
                  <TableCell>{low ? <Badge className="bg-rose-500/20 text-rose-400"><AlertTriangle className="mr-1 h-3 w-3" />Low</Badge> : <Badge className="bg-emerald-500/20 text-emerald-400">OK</Badge>}</TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No stock records.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
