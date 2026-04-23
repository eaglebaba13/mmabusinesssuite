import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatINR } from "@/lib/format";
import { ImportButton } from "@/components/app/ImportButton";

export const Route = createFileRoute("/app/inventory/products")({
  component: ProductsPage,
});

function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<any>(null);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*, product_categories(name)")
        .order("name");
      return data ?? [];
    },
  });

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("product_categories").select("*").order("name");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (form: any) => {
      const payload = {
        sku: form.sku,
        name: form.name,
        category_id: form.category_id || null,
        unit: form.unit || "pcs",
        hsn_code: form.hsn_code || null,
        cost_price: Number(form.cost_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        mrp: Number(form.mrp) || 0,
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
        active: form.active ?? true,
      };
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Product updated" : "Product created");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => {
      console.error(e);
      toast.error("Could not save product");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product deleted");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => toast.error("Could not delete product"),
  });

  const filtered = (products.data ?? []).filter((p: any) =>
    `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <ImportButton configKey="products" />
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-gold text-background hover:opacity-90"><Plus className="mr-1 h-4 w-4" /> Add Product</Button>
          </DialogTrigger>
          <ProductDialog editing={editing} categories={categories.data ?? []} onSubmit={(v) => save.mutate(v)} loading={save.isPending} />
        </Dialog>
      </div>

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Sale</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell><span className="text-muted-foreground">{p.product_categories?.name ?? "—"}</span></TableCell>
                <TableCell className="text-right">{formatINR(p.cost_price)}</TableCell>
                <TableCell className="text-right">{formatINR(p.sale_price)}</TableCell>
                <TableCell className="text-right">{formatINR(p.mrp)}</TableCell>
                <TableCell>
                  {p.active ? <Badge className="bg-emerald-500/20 text-emerald-400">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this product?")) remove.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No products found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function ProductDialog({ editing, categories, onSubmit, loading }: { editing: any; categories: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [form, setForm] = React.useState<any>({
    sku: "", name: "", category_id: "", unit: "pcs", hsn_code: "",
    cost_price: 0, sale_price: 0, mrp: 0, low_stock_threshold: 10, active: true,
  });
  React.useEffect(() => {
    if (editing) setForm(editing);
    else setForm({ sku: "", name: "", category_id: "", unit: "pcs", hsn_code: "", cost_price: 0, sale_price: 0, mrp: 0, low_stock_threshold: 10, active: true });
  }, [editing]);

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{editing ? "Edit Product" : "New Product"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div>
          <Label>Category</Label>
          <Select value={form.category_id ?? ""} onValueChange={(v) => setForm({ ...form, category_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
        <div><Label>HSN Code</Label><Input value={form.hsn_code ?? ""} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} /></div>
        <div><Label>Low Stock Threshold</Label><Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} /></div>
        <div><Label>Cost Price (₹)</Label><Input type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></div>
        <div><Label>Sale Price (₹)</Label><Input type="number" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} /></div>
        <div><Label>MRP (₹)</Label><Input type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} /></div>
        <div className="flex items-center gap-2 pt-6"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Active</Label></div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={loading} className="bg-gradient-gold text-background">{loading ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
