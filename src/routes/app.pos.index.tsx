import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, Receipt, X, Store, User as UserIcon, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatINR } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/pos/")({
  component: PosTerminal,
});

interface CartItem {
  product_id: string;
  product_name: string;
  sku: string | null;
  hsn_code: string | null;
  unit_price: number;
  quantity: number;
  discount_pct: number;
  gst_pct: number;
}

function PosTerminal() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, roles, hasAnyRole } = useAuth();
  const isFranchisee = hasAnyRole(["franchisee", "state_franchisee"]);
  const isAdmin = hasAnyRole(["super_admin", "founder"]);
  const primaryRole = roles[0] ?? "user";

  const [search, setSearch] = React.useState("");
  const [warehouseId, setWarehouseId] = React.useState<string>("");
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [customer, setCustomer] = React.useState({
    name: "",
    phone: "",
    email: "",
    gstin: "",
  });
  const [paymentMethod, setPaymentMethod] = React.useState<string>("cash");
  const [paymentReference, setPaymentReference] = React.useState("");

  // Current operator profile
  const profile = useQuery({
    queryKey: ["pos-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  // Warehouses scoped by role. Franchisees only see warehouses mapped to their franchisee record.
  const warehouses = useQuery({
    queryKey: ["pos-warehouses", user?.id, isFranchisee],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("warehouses")
        .select("id, name, code, city, franchisee_id, franchisees(id, full_name, user_id)")
        .eq("active", true)
        .order("name");
      const { data } = await q;
      const all = data ?? [];
      if (isFranchisee && !isAdmin) {
        return all.filter((w: any) => w.franchisees?.user_id === user!.id);
      }
      return all;
    },
  });

  const activeWarehouse = (warehouses.data ?? []).find((w: any) => w.id === warehouseId) as any;
  const noMapping = !warehouses.isLoading && (warehouses.data ?? []).length === 0;

  React.useEffect(() => {
    if (!warehouseId && warehouses.data && warehouses.data.length > 0) {
      setWarehouseId(warehouses.data[0].id);
    }
  }, [warehouses.data, warehouseId]);

  const products = useQuery({
    queryKey: ["pos-products", search],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, sku, sale_price, hsn_code, image_url")
        .eq("active", true)
        .order("name")
        .limit(60);
      if (search.trim()) {
        q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  const addToCart = (p: any) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          sku: p.sku,
          hsn_code: p.hsn_code,
          unit_price: Number(p.sale_price ?? 0),
          quantity: 1,
          discount_pct: 0,
          gst_pct: 18,
        },
      ];
    });
  };

  const updateCart = (idx: number, patch: Partial<CartItem>) => {
    setCart((prev) => prev.map((i, k) => (k === idx ? { ...i, ...patch } : i)));
  };

  const removeFromCart = (idx: number) => {
    setCart((prev) => prev.filter((_, k) => k !== idx));
  };

  const clearCart = () => {
    setCart([]);
    setCustomer({ name: "", phone: "", email: "", gstin: "" });
    setPaymentReference("");
  };

  // Compute totals (mirror of DB triggers, for live preview)
  const totals = React.useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let gst = 0;
    cart.forEach((i) => {
      const base = i.quantity * i.unit_price;
      const afterDisc = base - (base * i.discount_pct) / 100;
      subtotal += base;
      discount += base - afterDisc;
      gst += (afterDisc * i.gst_pct) / 100;
    });
    const grand = subtotal - discount + gst;
    return { subtotal, discount, gst, grand };
  }, [cart]);

  const checkout = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Cart is empty");
      if (!warehouseId) throw new Error("Select a warehouse");
      const { data: u } = await supabase.auth.getUser();

      // 1. Create draft order
      const { data: order, error: oErr } = await supabase
        .from("sales_orders")
        .insert({
          warehouse_id: warehouseId,
          customer_name: customer.name || null,
          customer_phone: customer.phone || null,
          customer_email: customer.email || null,
          customer_gstin: customer.gstin || null,
          status: "draft",
          served_by: u.user?.id,
        })
        .select("id")
        .single();
      if (oErr) throw oErr;

      // 2. Insert items (triggers will recalc totals)
      const items = cart.map((c) => ({
        order_id: order.id,
        product_id: c.product_id,
        product_name: c.product_name,
        sku: c.sku,
        hsn_code: c.hsn_code,
        quantity: c.quantity,
        unit_price: c.unit_price,
        discount_pct: c.discount_pct,
        gst_pct: c.gst_pct,
      }));
      const { error: iErr } = await supabase.from("sales_order_items").insert(items);
      if (iErr) throw iErr;

      // 3. Mark completed → triggers invoice number + stock deduction
      const { data: completed, error: cErr } = await supabase
        .from("sales_orders")
        .update({ status: "completed" })
        .eq("id", order.id)
        .select("id, grand_total, invoice_number")
        .single();
      if (cErr) throw cErr;

      // 4. Record payment for full amount
      const { error: pErr } = await supabase.from("sale_payments").insert({
        order_id: order.id,
        amount: completed.grand_total,
        method: paymentMethod as any,
        reference: paymentReference || null,
        recorded_by: u.user?.id,
      });
      if (pErr) throw pErr;

      return completed;
    },
    onSuccess: (order) => {
      toast.success(`Invoice ${order.invoice_number} created`);
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      clearCart();
      navigate({ to: "/app/pos/orders/$orderId", params: { orderId: order.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
      {/* Product picker */}
      <div className="space-y-3">
        {/* Attribution context banner */}
        <div className="rounded-2xl glass p-4">
          {noMapping ? (
            <div className="flex items-start gap-3 rounded-lg border border-rose-400/40 bg-rose-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div>
                <p className="font-medium text-rose-300">
                  No franchisee / outlet mapping found for this user.
                </p>
                <p className="mt-0.5 text-xs text-rose-300/80">
                  Please assign a franchisee + warehouse mapping before billing. Billing is blocked
                  until attribution context is resolved.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Billing Under
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 font-medium text-gold">
                  <Store className="h-3.5 w-3.5" />
                  {activeWarehouse?.franchisees?.full_name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Outlet
                </p>
                <p className="mt-0.5 font-medium">
                  {activeWarehouse?.name ?? "—"}
                  {activeWarehouse?.city ? (
                    <span className="ml-1 text-xs text-muted-foreground">· {activeWarehouse.city}</span>
                  ) : null}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Billing By
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 font-medium">
                  <UserIcon className="h-3.5 w-3.5 text-gold" />
                  {profile.data?.full_name ?? user?.email ?? "—"}
                  <Badge variant="outline" className="ml-1 border-border/50 text-[10px] capitalize">
                    {primaryRole.replace(/_/g, " ")}
                  </Badge>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl glass p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products by name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <Select value={warehouseId} onValueChange={setWarehouseId} disabled={isFranchisee && !isAdmin && (warehouses.data ?? []).length <= 1}>
            <SelectTrigger className="sm:w-[220px]">
              <SelectValue placeholder="Select outlet / warehouse" />
            </SelectTrigger>
            <SelectContent>
              {(warehouses.data ?? []).map((w: any) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                  {w.franchisees?.full_name ? ` — ${w.franchisees.full_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>


        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {products.isLoading ? (
            <p className="col-span-full p-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (products.data ?? []).length === 0 ? (
            <p className="col-span-full p-12 text-center text-sm text-muted-foreground">
              No products found
            </p>
          ) : (
            (products.data ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="group rounded-xl border border-border/50 bg-card/30 p-3 text-left transition-all hover:border-gold/60 hover:shadow-gold"
              >
                <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-foreground/5">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-full w-full rounded-lg object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{p.sku}</span>
                  )}
                </div>
                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.sku}</p>
                <p className="mt-1 font-semibold text-gold">{formatINR(Number(p.sale_price))}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="rounded-2xl glass p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">Current sale</h3>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart}>
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        {cart.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Click products to add them to the sale.
          </p>
        ) : (
          <div className="space-y-2">
            {cart.map((it, idx) => (
              <div key={idx} className="rounded-lg border border-border/40 p-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.product_name}</p>
                    <p className="text-xs text-muted-foreground">{formatINR(it.unit_price)} ea</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFromCart(idx)}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-md border border-border/50">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateCart(idx, { quantity: Math.max(1, it.quantity - 1) })}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{it.quantity}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateCart(idx, { quantity: it.quantity + 1 })}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <Input
                    type="number"
                    value={it.discount_pct}
                    onChange={(e) => updateCart(idx, { discount_pct: Number(e.target.value) || 0 })}
                    className="h-7 w-16 text-xs"
                    placeholder="0"
                    title="Discount %"
                  />
                  <span className="text-xs text-muted-foreground">% off</span>
                  <span className="ml-auto text-sm font-semibold text-gold">
                    {formatINR(
                      it.quantity * it.unit_price * (1 - it.discount_pct / 100) * (1 + it.gst_pct / 100),
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <Separator className="my-3" />

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Customer</Label>
          <Input placeholder="Name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className="h-8" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Phone" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="h-8" />
            <Input placeholder="GSTIN (optional)" value={customer.gstin} onChange={(e) => setCustomer({ ...customer, gstin: e.target.value })} className="h-8" />
          </div>
        </div>

        <Separator className="my-3" />

        <div className="space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatINR(totals.subtotal)} />
          {totals.discount > 0 && <Row label="Discount" value={`- ${formatINR(totals.discount)}`} className="text-rose-400" />}
          <Row label="GST (CGST + SGST)" value={formatINR(totals.gst)} />
          <Separator className="my-2" />
          <div className="flex items-center justify-between text-base">
            <span className="font-medium">Grand total</span>
            <span className="font-display text-xl text-gold">{formatINR(totals.grand)}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="wallet">Wallet</SelectItem>
              <SelectItem value="credit">Credit (unpaid)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Reference (txn/UTR)"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            className="h-9"
          />
        </div>

        <Button
          onClick={() => checkout.mutate()}
          disabled={cart.length === 0 || checkout.isPending || noMapping || !warehouseId}
          className="mt-3 h-12 w-full bg-gradient-gold text-base text-background"
        >
          <Receipt className="mr-2 h-5 w-5" />
          {checkout.isPending ? "Processing…" : `Charge ${formatINR(totals.grand)}`}
        </Button>
        {cart.length > 0 && (
          <Badge variant="outline" className="mt-2 w-full justify-center border-border/50 text-xs text-muted-foreground">
            Stock will deduct from selected warehouse on checkout
          </Badge>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex items-center justify-between ${className ?? ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
