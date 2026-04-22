import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/inventory/movements")({
  component: MovementsPage,
});

const TYPE_LABELS: Record<string, string> = {
  purchase_in: "Purchase In",
  sale_out: "Sale Out",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

function MovementsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({
    movement_type: "adjustment", product_id: "", source_warehouse_id: "", destination_warehouse_id: "",
    quantity: 0, reason: "",
  });

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("id, name, sku").order("name")).data ?? [],
  });
  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => (await supabase.from("warehouses").select("*").order("name")).data ?? [],
  });
  const movements = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku), src:warehouses!stock_movements_source_warehouse_id_fkey(name, code), dest:warehouses!stock_movements_destination_warehouse_id_fkey(name, code)")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        movement_type: form.movement_type,
        product_id: form.product_id,
        quantity: Number(form.quantity),
        reason: form.reason || null,
        recorded_by: user?.id,
      };
      if (form.movement_type === "transfer") {
        payload.source_warehouse_id = form.source_warehouse_id;
        payload.destination_warehouse_id = form.destination_warehouse_id;
      } else if (form.movement_type === "sale_out") {
        payload.source_warehouse_id = form.source_warehouse_id;
      } else {
        payload.destination_warehouse_id = form.destination_warehouse_id;
      }
      const { error } = await supabase.from("stock_movements").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movement recorded");
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      setOpen(false);
      setForm({ movement_type: "adjustment", product_id: "", source_warehouse_id: "", destination_warehouse_id: "", quantity: 0, reason: "" });
    },
    onError: (e: any) => {
      console.error(e);
      toast.error("Could not record movement");
    },
  });

  const needsSource = form.movement_type === "transfer" || form.movement_type === "sale_out";
  const needsDest = form.movement_type === "transfer" || form.movement_type === "purchase_in" || form.movement_type === "adjustment";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" /> Record Movement</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New Stock Movement</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Type</Label>
                <Select value={form.movement_type} onValueChange={(v) => setForm({ ...form, movement_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase_in">Purchase In</SelectItem>
                    <SelectItem value="sale_out">Sale Out</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Product</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{(products.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {needsSource && (
                <div className="col-span-2">
                  <Label>Source Warehouse</Label>
                  <Select value={form.source_warehouse_id} onValueChange={(v) => setForm({ ...form, source_warehouse_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{(warehouses.data ?? []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {needsDest && (
                <div className="col-span-2">
                  <Label>{form.movement_type === "adjustment" ? "Warehouse" : "Destination Warehouse"}</Label>
                  <Select value={form.destination_warehouse_id} onValueChange={(v) => setForm({ ...form, destination_warehouse_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{(warehouses.data ?? []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Quantity {form.movement_type === "adjustment" && <span className="text-xs text-muted-foreground">(use negative for decrease)</span>}</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
              <div><Label>Reason / Reference</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-gradient-gold text-background">Record</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>Product</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Reason</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {(movements.data ?? []).map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline" className="border-primary/40 text-primary">{TYPE_LABELS[m.movement_type]}</Badge></TableCell>
                <TableCell><div className="font-medium">{m.products?.name}</div><div className="font-mono text-xs text-muted-foreground">{m.products?.sku}</div></TableCell>
                <TableCell>{m.src ? <Badge variant="outline">{m.src.code}</Badge> : "—"}</TableCell>
                <TableCell>{m.dest ? <Badge variant="outline">{m.dest.code}</Badge> : "—"}</TableCell>
                <TableCell className="text-right font-mono">{Number(m.quantity).toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground">{m.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
            {movements.data?.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No movements yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
