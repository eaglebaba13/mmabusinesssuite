import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatINR } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { ImportButton } from "@/components/app/ImportButton";

export const Route = createFileRoute("/app/inventory/purchase-orders")({
  component: PurchaseOrdersPage,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-foreground",
  sent: "bg-blue-500/20 text-blue-400",
  partially_received: "bg-amber-500/20 text-amber-400",
  received: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-rose-500/20 text-rose-400",
};

function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({
    po_number: `PO-${Date.now().toString().slice(-6)}`,
    supplier_id: "", warehouse_id: "", expected_date: "",
    items: [{ product_id: "", ordered_qty: 1, unit_cost: 0 }],
  });

  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await supabase.from("suppliers").select("*").eq("active", true).order("name")).data ?? [] });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: async () => (await supabase.from("warehouses").select("*").eq("active", true).order("name")).data ?? [] });
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await supabase.from("products").select("id, name, sku, cost_price").eq("active", true).order("name")).data ?? [] });

  const orders = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(name), warehouses(name, code), purchase_order_items(id, ordered_qty, received_qty, unit_cost, products(name, sku))")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const totalAmount = React.useMemo(
    () => form.items.reduce((s: number, i: any) => s + Number(i.ordered_qty || 0) * Number(i.unit_cost || 0), 0),
    [form.items],
  );

  const create = useMutation({
    mutationFn: async () => {
      const { data: po, error } = await supabase
        .from("purchase_orders")
        .insert({
          po_number: form.po_number,
          supplier_id: form.supplier_id,
          warehouse_id: form.warehouse_id,
          expected_date: form.expected_date || null,
          total_amount: totalAmount,
          status: "draft",
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      const items = form.items.filter((i: any) => i.product_id).map((i: any) => ({
        po_id: po.id, product_id: i.product_id, ordered_qty: Number(i.ordered_qty), unit_cost: Number(i.unit_cost),
      }));
      if (items.length) {
        const { error: e2 } = await supabase.from("purchase_order_items").insert(items);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("Purchase order created");
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      setOpen(false);
      setForm({ po_number: `PO-${Date.now().toString().slice(-6)}`, supplier_id: "", warehouse_id: "", expected_date: "", items: [{ product_id: "", ordered_qty: 1, unit_cost: 0 }] });
    },
    onError: (e: any) => { console.error(e); toast.error("Could not create PO"); },
  });

  const receive = useMutation({
    mutationFn: async (po: any) => {
      // Mark each item as fully received and create stock_in movements
      const movements = po.purchase_order_items.map((it: any) => ({
        product_id: it.products ? po.purchase_order_items.find((x: any) => x.id === it.id).product_id ?? null : null,
        destination_warehouse_id: po.warehouse_id,
        quantity: Number(it.ordered_qty),
        movement_type: "purchase_in",
        reference_type: "purchase_order",
        reference_id: po.id,
        reason: `PO ${po.po_number}`,
        recorded_by: user?.id,
      }));
      // We need product_id directly — refetch items
      const { data: items } = await supabase.from("purchase_order_items").select("*").eq("po_id", po.id);
      const fullMovements = (items ?? []).map((it: any) => ({
        product_id: it.product_id,
        destination_warehouse_id: po.warehouse_id,
        quantity: Number(it.ordered_qty),
        movement_type: "purchase_in" as const,
        reference_type: "purchase_order",
        reference_id: po.id,
        reason: `PO ${po.po_number}`,
        recorded_by: user?.id,
      }));
      const { error: mErr } = await supabase.from("stock_movements").insert(fullMovements);
      if (mErr) throw mErr;
      // Update items
      for (const it of items ?? []) {
        await supabase.from("purchase_order_items").update({ received_qty: it.ordered_qty }).eq("id", it.id);
      }
      const { error } = await supabase.from("purchase_orders").update({ status: "received", received_date: new Date().toISOString().slice(0, 10) }).eq("id", po.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("PO received — stock updated");
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
    },
    onError: (e: any) => { console.error(e); toast.error("Could not receive PO"); },
  });

  const sendPO = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_orders").update({ status: "sent" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Marked as sent"); qc.invalidateQueries({ queryKey: ["purchase-orders"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <ImportButton configKey="purchase_orders" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" /> New Purchase Order</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>PO Number</Label><Input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} /></div>
              <div><Label>Expected Date</Label><Input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} /></div>
              <div>
                <Label>Supplier</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{(suppliers.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Receive at Warehouse</Label>
                <Select value={form.warehouse_id} onValueChange={(v) => setForm({ ...form, warehouse_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{(warehouses.data ?? []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <Label>Line Items</Label>
                <Button size="sm" variant="outline" onClick={() => setForm({ ...form, items: [...form.items, { product_id: "", ordered_qty: 1, unit_cost: 0 }] })}><Plus className="mr-1 h-3 w-3" /> Add Line</Button>
              </div>
              <div className="space-y-2">
                {form.items.map((item: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <Select value={item.product_id} onValueChange={(v) => {
                        const items = [...form.items];
                        const prod = (products.data ?? []).find((p: any) => p.id === v);
                        items[idx] = { ...items[idx], product_id: v, unit_cost: prod?.cost_price ?? 0 };
                        setForm({ ...form, items });
                      }}>
                        <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                        <SelectContent>{(products.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input className="col-span-2" type="number" placeholder="Qty" value={item.ordered_qty} onChange={(e) => {
                      const items = [...form.items]; items[idx] = { ...items[idx], ordered_qty: e.target.value }; setForm({ ...form, items });
                    }} />
                    <Input className="col-span-3" type="number" placeholder="Unit cost" value={item.unit_cost} onChange={(e) => {
                      const items = [...form.items]; items[idx] = { ...items[idx], unit_cost: e.target.value }; setForm({ ...form, items });
                    }} />
                    <Button className="col-span-1" variant="ghost" onClick={() => setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) })}>×</Button>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-right text-sm">Total: <span className="font-display text-lg text-gradient-gold">{formatINR(totalAmount)}</span></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending} className="bg-gradient-gold text-background">Create PO</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {(orders.data ?? []).map((po: any) => (
          <Card key={po.id} className="glass p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-primary/40 text-primary font-mono">{po.po_number}</Badge>
                  <Badge className={STATUS_COLORS[po.status] ?? ""}>{po.status.replace("_", " ")}</Badge>
                </div>
                <h3 className="mt-1 font-display text-lg">{po.suppliers?.name}</h3>
                <p className="text-xs text-muted-foreground">→ {po.warehouses?.code} {po.warehouses?.name} · ordered {po.order_date} · {po.purchase_order_items?.length ?? 0} line(s)</p>
              </div>
              <div className="text-right">
                <div className="font-display text-xl text-gradient-gold">{formatINR(po.total_amount)}</div>
                <div className="mt-2 flex gap-2">
                  {po.status === "draft" && <Button size="sm" variant="outline" onClick={() => sendPO.mutate(po.id)}>Mark Sent</Button>}
                  {(po.status === "sent" || po.status === "partially_received") && <Button size="sm" className="bg-gradient-gold text-background" onClick={() => receive.mutate(po)}>Receive Stock <ArrowRight className="ml-1 h-3 w-3" /></Button>}
                </div>
              </div>
            </div>
            {po.purchase_order_items && po.purchase_order_items.length > 0 && (
              <div className="mt-3 border-t border-border/50 pt-3">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Product</TableHead><TableHead className="text-right">Ordered</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Unit Cost</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {po.purchase_order_items.map((it: any) => (
                      <TableRow key={it.id}>
                        <TableCell><div className="font-medium">{it.products?.name}</div><div className="font-mono text-xs text-muted-foreground">{it.products?.sku}</div></TableCell>
                        <TableCell className="text-right">{it.ordered_qty}</TableCell>
                        <TableCell className="text-right">{it.received_qty}</TableCell>
                        <TableCell className="text-right">{formatINR(it.unit_cost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        ))}
        {orders.data?.length === 0 && <Card className="p-8 text-center text-muted-foreground">No purchase orders yet.</Card>}
      </div>
    </div>
  );
}
