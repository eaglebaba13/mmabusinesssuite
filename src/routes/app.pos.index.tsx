import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, Receipt, X, Store, User as UserIcon, AlertTriangle, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatINR } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { usePersistedState } from "@/hooks/use-persisted-state";

export const Route = createFileRoute("/app/pos/")({
  component: PosTerminal,
});

type MappingType = "company_direct" | "master" | "state" | "city";
type SaleCategory =
  | "tns_turnover"
  | "academy_sales"
  | "mall_of_salon_sales"
  | "product_sales"
  | "service_sales"
  | "membership"
  | "franchise_fee"
  | "royalty"
  | "other";

const MAPPING_LABELS: Record<MappingType, string> = {
  company_direct: "Company Direct",
  master: "Master Franchise",
  state: "State Franchise",
  city: "City Franchise",
};

const CATEGORY_LABELS: Record<SaleCategory, string> = {
  tns_turnover: "TNS Turnover",
  academy_sales: "Academy Sales",
  mall_of_salon_sales: "Mall of Salon Sales",
  product_sales: "Product Sales",
  service_sales: "Service Sales",
  membership: "Membership",
  franchise_fee: "Franchise Fee",
  royalty: "Royalty",
  other: "Other",
};

// Which categories contribute to Variable ROI, and which % on the franchisee row drives it.
const ROI_PCT_FIELD: Partial<Record<SaleCategory, "tns_percent" | "academy_percent" | "mall_percent">> = {
  tns_turnover: "tns_percent",
  academy_sales: "academy_percent",
  mall_of_salon_sales: "mall_percent",
};

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
  const [mappingType, setMappingType] = React.useState<MappingType | "">("");
  const [franchiseeId, setFranchiseeId] = React.useState<string>("");
  const [warehouseId, setWarehouseId] = React.useState<string>("");
  const [category, setCategory] = React.useState<SaleCategory | "">("");
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [customer, setCustomer] = React.useState({ name: "", phone: "", email: "", gstin: "" });
  const [paymentMethod, setPaymentMethod] = React.useState<string>("cash");
  const [paymentReference, setPaymentReference] = React.useState("");
  const [saleDate, setSaleDate] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const todayIso = new Date().toISOString().slice(0, 10);

  const profile = useQuery({
    queryKey: ["pos-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  // All active franchisees (scoped for franchisee role)
  const franchisees = useQuery({
    queryKey: ["pos-franchisees", user?.id, isFranchisee, isAdmin],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("franchisees")
        .select("id, full_name, franchise_type, status, agreement_version, agreement_expiry, investment_amount, mg_percent, tns_percent, academy_percent, mall_percent, territory_id, user_id")
        .eq("status", "active")
        .order("full_name");
      const { data } = await q;
      const all = data ?? [];
      if (isFranchisee && !isAdmin) return all.filter((f: any) => f.user_id === user!.id);
      return all;
    },
  });

  const selectedFranchisee = React.useMemo(
    () => (franchisees.data ?? []).find((f: any) => f.id === franchiseeId),
    [franchisees.data, franchiseeId],
  );

  // Warehouses filtered by chosen franchisee (or all when Company Direct)
  const warehouses = useQuery({
    queryKey: ["pos-warehouses", franchiseeId, mappingType],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("warehouses")
        .select("id, name, code, city, franchisee_id, franchisees(id, full_name)")
        .eq("active", true)
        .order("name");
      if (mappingType && mappingType !== "company_direct" && franchiseeId) {
        q = q.eq("franchisee_id", franchiseeId);
      } else if (mappingType === "company_direct") {
        q = q.is("franchisee_id", null);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  const activeWarehouse = (warehouses.data ?? []).find((w: any) => w.id === warehouseId) as any;

  // Auto-select single outlet
  React.useEffect(() => {
    setWarehouseId("");
  }, [franchiseeId, mappingType]);
  React.useEffect(() => {
    if (!warehouseId && (warehouses.data ?? []).length === 1) {
      setWarehouseId((warehouses.data as any[])[0].id);
    }
  }, [warehouses.data, warehouseId]);

  // Force franchisee-role user to their own record
  React.useEffect(() => {
    if (isFranchisee && !isAdmin && (franchisees.data ?? []).length === 1 && !franchiseeId) {
      setMappingType("city");
      setFranchiseeId((franchisees.data as any[])[0].id);
    }
  }, [franchisees.data, isFranchisee, isAdmin, franchiseeId]);

  // Suggest default category once franchise selected
  React.useEffect(() => {
    if (mappingType && mappingType !== "company_direct" && !category) {
      setCategory("tns_turnover");
    }
  }, [mappingType, category]);

  const products = useQuery({
    queryKey: ["pos-products", search],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, sku, sale_price, hsn_code, image_url")
        .eq("active", true)
        .order("name")
        .limit(60);
      if (search.trim()) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  const addToCart = (p: any) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) return prev.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [
        ...prev,
        {
          product_id: p.id, product_name: p.name, sku: p.sku, hsn_code: p.hsn_code,
          unit_price: Number(p.sale_price ?? 0), quantity: 1, discount_pct: 0, gst_pct: 18,
        },
      ];
    });
  };
  const updateCart = (idx: number, patch: Partial<CartItem>) =>
    setCart((prev) => prev.map((i, k) => (k === idx ? { ...i, ...patch } : i)));
  const removeFromCart = (idx: number) => setCart((prev) => prev.filter((_, k) => k !== idx));
  const clearCart = () => {
    setCart([]); setCustomer({ name: "", phone: "", email: "", gstin: "" }); setPaymentReference("");
    setSaleDate(new Date().toISOString().slice(0, 10));
  };

  const totals = React.useMemo(() => {
    let subtotal = 0, discount = 0, gst = 0;
    cart.forEach((i) => {
      const base = i.quantity * i.unit_price;
      const afterDisc = base - (base * i.discount_pct) / 100;
      subtotal += base;
      discount += base - afterDisc;
      gst += (afterDisc * i.gst_pct) / 100;
    });
    return { subtotal, discount, gst, grand: subtotal - discount + gst };
  }, [cart]);

  // Live monthly ROI for selected franchisee (before this sale)
  const monthKey = React.useMemo(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  }, []);
  const monthlyRoi = useQuery({
    queryKey: ["pos-monthly-roi", franchiseeId, monthKey],
    enabled: !!franchiseeId && mappingType !== "company_direct",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_franchisee_monthly_roi", {
        _franchisee_id: franchiseeId, _month: monthKey,
      });
      if (error) throw error;
      return (data ?? [])[0];
    },
  });

  // Compute this sale's incentive + projected payable
  const preview = React.useMemo(() => {
    if (!selectedFranchisee || !category || mappingType === "company_direct") return null;
    const f: any = selectedFranchisee;
    const pctField = ROI_PCT_FIELD[category as SaleCategory];
    const pct = pctField ? Number(f[pctField] ?? 0) : 0;
    const incentive = (totals.grand * pct) / 100;
    const prevVariable = monthlyRoi.data ? Number((monthlyRoi.data as any).variable_roi ?? 0) : 0;
    const mg = monthlyRoi.data ? Number((monthlyRoi.data as any).mg ?? 0)
      : (Number(f.investment_amount ?? 0) * Number(f.mg_percent ?? 0)) / 100;
    const projectedVariable = prevVariable + incentive;
    const payable = Math.max(mg, projectedVariable);
    const reason = projectedVariable >= mg ? "Variable ROI is Higher" : "Minimum Guarantee Applied";
    return { pct, incentive, prevVariable, mg, projectedVariable, payable, reason };
  }, [selectedFranchisee, category, mappingType, totals.grand, monthlyRoi.data]);

  const noOutlet = !warehouses.isLoading && (warehouses.data ?? []).length === 0;
  const saleDateValid = !!saleDate && saleDate <= todayIso;
  const canCheckout =
    cart.length > 0 &&
    !!mappingType &&
    (mappingType === "company_direct" || (!!franchiseeId && !!category)) &&
    saleDateValid;

  const checkout = useMutation({
    mutationFn: async () => {
      if (!canCheckout) throw new Error("Complete Billing Under, Franchise and Category before charging");
      const { data: u } = await supabase.auth.getUser();

      const { data: order, error: oErr } = await supabase
        .from("sales_orders")
        .insert({
          warehouse_id: warehouseId || null,
          franchisee_id: mappingType === "company_direct" ? null : franchiseeId || null,
          franchise_mapping_type: mappingType,
          invoice_category: mappingType === "company_direct" ? "other" : category,
          customer_name: customer.name || null,
          customer_phone: customer.phone || null,
          customer_email: customer.email || null,
          customer_gstin: customer.gstin || null,
          status: "draft",
          served_by: u.user?.id,
        } as any)
        .select("id")
        .single();
      if (oErr) throw oErr;

      const items = cart.map((c) => ({
        order_id: order.id, product_id: c.product_id, product_name: c.product_name,
        sku: c.sku, hsn_code: c.hsn_code, quantity: c.quantity,
        unit_price: c.unit_price, discount_pct: c.discount_pct, gst_pct: c.gst_pct,
      }));
      const { error: iErr } = await supabase.from("sales_order_items").insert(items);
      if (iErr) throw iErr;

      // Set completed_at from the user-selected sale date so invoice_date matches.
      // We anchor to noon UTC to avoid any timezone slippage to prev/next day.
      const completedAtIso = new Date(`${saleDate}T12:00:00Z`).toISOString();
      const { data: completed, error: cErr } = await supabase
        .from("sales_orders").update({ status: "completed", completed_at: completedAtIso } as any).eq("id", order.id)
        .select("id, grand_total, invoice_number").single();
      if (cErr) throw cErr;

      const { error: pErr } = await supabase.from("sale_payments").insert({
        order_id: order.id, amount: completed.grand_total,
        method: paymentMethod as any, reference: paymentReference || null,
        recorded_by: u.user?.id,
      });
      if (pErr) throw pErr;

      return completed;
    },
    onSuccess: (order) => {
      toast.success(`Invoice ${order.invoice_number} created`);
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["monthly-roi"] });
      qc.invalidateQueries({ queryKey: ["franchisee-payouts"] });
      clearCart();
      navigate({ to: "/app/pos/orders/$orderId", params: { orderId: order.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const agreementStatus = selectedFranchisee ? franchiseeAgreementStatus(selectedFranchisee as any) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
      {/* LEFT: mapping + product picker */}
      <div className="space-y-3">
        {/* Billing Under panel — mandatory */}
        <div className="rounded-2xl glass p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Billing Under *</Label>
              <Select value={mappingType} onValueChange={(v) => { setMappingType(v as MappingType); setFranchiseeId(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select mapping…" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MAPPING_LABELS) as MappingType[]).map((k) => (
                    <SelectItem key={k} value={k}>{MAPPING_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mappingType && mappingType !== "company_direct" && (
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Franchise *</Label>
                <Select value={franchiseeId} onValueChange={setFranchiseeId} disabled={isFranchisee && !isAdmin && (franchisees.data ?? []).length <= 1}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select franchise…" /></SelectTrigger>
                  <SelectContent>
                    {(franchisees.data ?? []).map((f: any) => (
                      <SelectItem key={f.id} value={f.id}>{f.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mappingType && mappingType !== "company_direct" && (
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sale Category *</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as SaleCategory)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select category…" /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_LABELS) as SaleCategory[]).map((k) => (
                      <SelectItem key={k} value={k}>{CATEGORY_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Agreement summary */}
          {selectedFranchisee && (
            <div className="grid gap-2 rounded-xl bg-background/40 p-3 text-xs sm:grid-cols-4">
              <Info label="Franchise" value={(selectedFranchisee as any).full_name} />
              <Info label="Investment" value={formatINR(Number((selectedFranchisee as any).investment_amount ?? 0))} />
              <Info label="MG %" value={`${Number((selectedFranchisee as any).mg_percent ?? 0)}%`} />
              <Info label="Agreement" value={agreementStatus ?? "—"} tone={agreementStatus === "active" ? "ok" : "warn"} />
            </div>
          )}

          {!mappingType && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/5 p-3 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Select "Billing Under" to begin. Sale cannot be completed without a mapping.
            </div>
          )}

          {agreementStatus && agreementStatus !== "active" && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-400/40 bg-rose-500/5 p-3 text-xs text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Agreement is <b className="mx-1 capitalize">{agreementStatus}</b>. Billing to this franchise is blocked until it is renewed.
            </div>
          )}
        </div>

        {/* Search + outlet + operator strip */}
        <div className="flex flex-col gap-2 rounded-2xl glass p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search products by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" autoFocus />
          </div>
          <Select value={warehouseId} onValueChange={setWarehouseId} disabled={noOutlet}>
            <SelectTrigger className="sm:w-[240px]"><SelectValue placeholder={noOutlet ? "No outlet available" : "Select outlet…"} /></SelectTrigger>
            <SelectContent>
              {(warehouses.data ?? []).map((w: any) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}{w.city ? ` · ${w.city}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {noOutlet && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-400">
            No outlet linked to this franchise — you can still charge, but stock will not be deducted. Link a warehouse under Inventory → Warehouses to enable stock tracking.
          </div>
        )}

        {activeWarehouse && (
          <div className="rounded-xl bg-background/40 px-4 py-2 text-xs text-muted-foreground flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-gold" /> {activeWarehouse.name}</span>
            <span className="inline-flex items-center gap-1"><UserIcon className="h-3.5 w-3.5 text-gold" /> {profile.data?.full_name ?? user?.email}</span>
            <Badge variant="outline" className="border-border/50 text-[10px] capitalize">{primaryRole.replace(/_/g, " ")}</Badge>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {products.isLoading ? (
            <p className="col-span-full p-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (products.data ?? []).length === 0 ? (
            <p className="col-span-full p-12 text-center text-sm text-muted-foreground">No products found</p>
          ) : (
            (products.data ?? []).map((p) => (
              <button key={p.id} onClick={() => addToCart(p)} className="group rounded-xl border border-border/50 bg-card/30 p-3 text-left transition-all hover:border-gold/60 hover:shadow-gold">
                <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-foreground/5">
                  {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full rounded-lg object-cover" /> : <span className="text-xs text-muted-foreground">{p.sku}</span>}
                </div>
                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.sku}</p>
                <p className="mt-1 font-semibold text-gold">{formatINR(Number(p.sale_price))}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT: cart */}
      <div className="rounded-2xl glass p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">Current sale</h3>
          {cart.length > 0 && <Button variant="ghost" size="sm" onClick={clearCart}><X className="mr-1 h-3.5 w-3.5" />Clear</Button>}
        </div>

        {cart.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Click products to add them to the sale.</p>
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateCart(idx, { quantity: Math.max(1, it.quantity - 1) })}><Minus className="h-3 w-3" /></Button>
                    <span className="w-8 text-center text-sm font-medium">{it.quantity}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateCart(idx, { quantity: it.quantity + 1 })}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <Input type="number" value={it.discount_pct} onChange={(e) => updateCart(idx, { discount_pct: Number(e.target.value) || 0 })} className="h-7 w-16 text-xs" placeholder="0" title="Discount %" />
                  <span className="text-xs text-muted-foreground">% off</span>
                  <span className="ml-auto text-sm font-semibold text-gold">
                    {formatINR(it.quantity * it.unit_price * (1 - it.discount_pct / 100) * (1 + it.gst_pct / 100))}
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
          <Row label="GST" value={formatINR(totals.gst)} />
          <Separator className="my-2" />
          <div className="flex items-center justify-between text-base">
            <span className="font-medium">Grand total</span>
            <span className="font-display text-xl text-gold">{formatINR(totals.grand)}</span>
          </div>
        </div>

        {/* Franchise ROI Preview */}
        {preview && (
          <div className="mt-3 rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 to-amber-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-gold">Franchise ROI Preview</p>
            <div className="mt-2 space-y-1 text-xs">
              <Row label="Billing under" value={`${MAPPING_LABELS[mappingType as MappingType]} · ${(selectedFranchisee as any).full_name}`} />
              <Row label="Sale type" value={CATEGORY_LABELS[category as SaleCategory]} />
              <Row label="Agreement %" value={`${preview.pct}%`} />
              <Row label="This sale incentive" value={formatINR(preview.incentive)} className="text-gold" />
              <Separator className="my-1.5" />
              <Row label="MTD variable ROI (after)" value={formatINR(preview.projectedVariable)} />
              <Row label="Monthly MG" value={formatINR(preview.mg)} />
              <div className="flex items-center justify-between pt-1">
                <span className="font-medium">Projected monthly payable</span>
                <span className="font-display text-base text-gold">{formatINR(preview.payable)}</span>
              </div>
              <p className="pt-1 text-[10px] italic text-muted-foreground">Reason: {preview.reason}</p>
            </div>
          </div>
        )}

        <div className="mt-3 space-y-2">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Sale Date <span className="text-destructive">*</span>
            </label>
            <Input
              type="date"
              value={saleDate}
              max={todayIso}
              onChange={(e) => setSaleDate(e.target.value)}
              className="h-9"
              required
            />
            {!saleDateValid && (
              <p className="mt-1 text-[10px] text-destructive">Pick a sale date (today or earlier).</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
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
            <Input placeholder="Reference (txn/UTR)" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="h-9" />
          </div>
        </div>

        <Button
          onClick={() => checkout.mutate()}
          disabled={!canCheckout || checkout.isPending || (agreementStatus !== null && agreementStatus !== "active")}
          className="mt-3 h-12 w-full bg-gradient-gold text-base text-background"
        >
          <Receipt className="mr-2 h-5 w-5" />
          {checkout.isPending ? "Processing…" : `Charge ${formatINR(totals.grand)}`}
        </Button>
        {!mappingType && (
          <p className="mt-2 text-center text-[11px] text-amber-300">Select Billing Under above to enable checkout.</p>
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

function Info({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-medium ${tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : ""}`}>{value}</p>
    </div>
  );
}

function franchiseeAgreementStatus(f: { agreement_expiry?: string | null; status?: string | null }): string {
  if (f.status && f.status !== "active") return f.status;
  const today = new Date().toISOString().slice(0, 10);
  if (!f.agreement_expiry) return "active";
  if (f.agreement_expiry < today) return "expired";
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  if (f.agreement_expiry <= in30.toISOString().slice(0, 10)) return "expiring";
  return "active";
}
