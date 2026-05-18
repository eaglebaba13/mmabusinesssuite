import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import {
  TrendingUp,
  Wallet,
  ShoppingCart,
  Receipt,
  Users,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Boxes,
  GraduationCap,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/app/KpiCard";
import { formatINRCompact, formatINR } from "@/lib/format";

interface Props {
  franchiseeId: string;
  franchiseeName: string;
  investment: number;
  joinedAt?: string | null;
  status?: string | null;
  territoryId?: string | null;
}

export function FranchiseeDashboard({
  franchiseeId,
  franchiseeName,
  investment,
  joinedAt,
  status,
  territoryId,
}: Props) {
  const qc = useQueryClient();
  const since = React.useMemo(() => subMonths(new Date(), 5), []);
  const since6mStart = startOfMonth(since).toISOString().slice(0, 10);

  // Realtime: invalidate franchisee-scoped queries when admins record changes
  React.useEffect(() => {
    const ch = supabase
      .channel(`fr-dash-${franchiseeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "revenue_entries", filter: `franchisee_id=eq.${franchiseeId}` },
        () => qc.invalidateQueries({ queryKey: ["fr-dash-revenue", franchiseeId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_orders", filter: `franchisee_id=eq.${franchiseeId}` },
        () => qc.invalidateQueries({ queryKey: ["fr-dash-orders", franchiseeId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roi_payouts", filter: `franchisee_id=eq.${franchiseeId}` },
        () => qc.invalidateQueries({ queryKey: ["fr-dash-payouts", franchiseeId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses", filter: `franchisee_id=eq.${franchiseeId}` },
        () => qc.invalidateQueries({ queryKey: ["fr-dash-expenses", franchiseeId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `franchisee_id=eq.${franchiseeId}` },
        () => qc.invalidateQueries({ queryKey: ["fr-dash-invoices", franchiseeId] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [franchiseeId, qc]);

  // Realtime for territory-scoped leads
  React.useEffect(() => {
    if (!territoryId) return;
    const ch = supabase
      .channel(`fr-dash-leads-${territoryId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `territory_id=eq.${territoryId}` },
        () => qc.invalidateQueries({ queryKey: ["fr-leads", territoryId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [territoryId, qc]);

  // Full franchisee record for spec/equipment fields
  const { data: franchisee } = useQuery({
    queryKey: ["fr-dash-record", franchiseeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("franchisees")
        .select("*")
        .eq("id", franchiseeId)
        .maybeSingle();
      return data;
    },
  });

  const { data: revenue = [] } = useQuery({
    queryKey: ["fr-dash-revenue", franchiseeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("revenue_entries")
        .select("amount, received_on, source")
        .eq("franchisee_id", franchiseeId)
        .gte("received_on", since6mStart)
        .order("received_on", { ascending: true });
      return data ?? [];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["fr-dash-orders", franchiseeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_orders")
        .select("id, grand_total, status, payment_status, created_at, customer_name, invoice_number")
        .eq("franchisee_id", franchiseeId)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["fr-dash-expenses", franchiseeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("expenses")
        .select("amount, expense_date, vendor, description")
        .eq("franchisee_id", franchiseeId)
        .gte("expense_date", since6mStart)
        .order("expense_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["fr-dash-payouts", franchiseeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("roi_payouts")
        .select("*")
        .eq("franchisee_id", franchiseeId)
        .order("payout_month", { ascending: false });
      return data ?? [];
    },
  });

  // Invoices mapped to this franchisee — applies the same revenue rule as
  // the impersonation entity dashboard (final outward tax invoices only).
  const { data: allInvoices = [] } = useQuery({
    queryKey: ["fr-dash-invoices", franchiseeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id,invoice_number,doc_type,status,grand_total,amount_paid,invoice_date,is_intercompany,parent_invoice_id")
        .or(`franchisee_id.eq.${franchiseeId},and(bill_to_entity_type.eq.city_franchise,bill_to_entity_id.eq.${franchiseeId})`)
        .order("invoice_date", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });
  const REVENUE_DOC_TYPES = React.useMemo(() => new Set(["b2b_tax", "b2c", "debit_note"]), []);
  const REVENUE_STATUSES = React.useMemo(() => new Set(["issued", "paid", "partial"]), []);
  const invoicePartition = React.useMemo(() => {
    const inc: typeof allInvoices = [];
    const exc: Array<(typeof allInvoices)[number] & { exclusion_reason: string }> = [];
    for (const r of allInvoices) {
      let reason: string | null = null;
      if (r.is_intercompany === true) reason = "intercompany";
      else if (!REVENUE_DOC_TYPES.has(r.doc_type)) reason = `non_revenue_doc:${r.doc_type}`;
      else if (!r.status || !REVENUE_STATUSES.has(r.status)) reason = `excluded_status:${r.status ?? "null"}`;
      if (reason) exc.push({ ...r, exclusion_reason: reason });
      else inc.push(r);
    }
    return { included: inc, excluded: exc };
  }, [allInvoices, REVENUE_DOC_TYPES, REVENUE_STATUSES]);
  const invoiceRevenue = invoicePartition.included.reduce((s, i) => s + Number(i.grand_total), 0);

  // Inventory snapshot — only when franchisee has a linked warehouse
  const warehouseId = franchisee?.warehouse_id ?? null;
  const { data: stockRows = [] } = useQuery({
    queryKey: ["fr-dash-stock", warehouseId],
    enabled: !!warehouseId,
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_levels")
        .select("quantity, products!inner(id, name, sku, low_stock_threshold)")
        .eq("warehouse_id", warehouseId!)
        .order("quantity", { ascending: true })
        .limit(50);
      return (data ?? []) as any[];
    },
  });

  const totalRevenue = revenue.reduce((s, r) => s + Number(r.amount), 0);
  const completedOrders = orders.filter((o) => o.status === "completed");
  const grossSales = completedOrders.reduce((s, o) => s + Number(o.grand_total), 0);
  const pendingOrders = orders.filter((o) => o.status !== "completed" && o.status !== "cancelled").length;
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const lifetimePaid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
  const pendingPayout = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.total_amount), 0);

  const monthStart = startOfMonth(new Date()).toISOString().slice(0, 10);
  const monthEnd = endOfMonth(new Date()).toISOString().slice(0, 10);
  const monthRevenue = revenue
    .filter((r) => r.received_on >= monthStart && r.received_on <= monthEnd)
    .reduce((s, r) => s + Number(r.amount), 0);
  const monthOrders = orders.filter((o) => {
    const d = o.created_at.slice(0, 10);
    return d >= monthStart && d <= monthEnd && o.status === "completed";
  });
  const monthGross = monthOrders.reduce((s, o) => s + Number(o.grand_total), 0);
  const monthExpenses = expenses
    .filter((e) => e.expense_date >= monthStart && e.expense_date <= monthEnd)
    .reduce((s, e) => s + Number(e.amount), 0);
  const monthRoiPaid = payouts
    .filter((p) => p.status === "paid" && p.paid_at && p.paid_at.slice(0, 10) >= monthStart && p.paid_at.slice(0, 10) <= monthEnd)
    .reduce((s, p) => s + Number(p.total_amount), 0);

  const monthPL = monthRevenue + monthGross - monthExpenses - monthRoiPaid;
  const lifetimePL = totalRevenue + grossSales - totalExpenses - lifetimePaid;

  const roiYieldPct = investment > 0 ? (lifetimePaid / investment) * 100 : 0;

  // ROI structure pulled from franchisee record (with sensible defaults)
  const fee = Number(franchisee?.franchise_fee ?? 500000);
  const baseRoiPct = Number(franchisee?.base_roi_pct ?? 3);
  const emporiumPct = Number(franchisee?.emporium_pct ?? 10);
  const academyPct = Number(franchisee?.academy_pct ?? 3);
  const darkPct = Number(franchisee?.dark_store_pct ?? 3);

  // Equipment compliance
  const equipment = [
    { label: "Area ≥ 150 sq ft", ok: Number(franchisee?.area_sqft ?? 0) >= 150, value: franchisee?.area_sqft ? `${franchisee.area_sqft} sq ft` : "—" },
    { label: "Chairs (≥ 2)", ok: Number(franchisee?.chairs ?? 0) >= 2, value: String(franchisee?.chairs ?? 0) },
    { label: "Table (≥ 1)", ok: Number(franchisee?.tables_count ?? 0) >= 1, value: String(franchisee?.tables_count ?? 0) },
    { label: "CCTV camera (≥ 1)", ok: Number(franchisee?.cctv_count ?? 0) >= 1, value: String(franchisee?.cctv_count ?? 0) },
    { label: "Computer (≥ 1)", ok: Number(franchisee?.computer_count ?? 0) >= 1, value: String(franchisee?.computer_count ?? 0) },
    { label: "Printer (≥ 1)", ok: Number(franchisee?.printer_count ?? 0) >= 1, value: String(franchisee?.printer_count ?? 0) },
  ];
  const compliantCount = equipment.filter((e) => e.ok).length;
  const fullyCompliant = compliantCount === equipment.length;

  // 6-month series
  const months = React.useMemo(() => {
    const arr: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      arr.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM") });
    }
    return arr;
  }, []);

  const revenueSeries = months.map((m) => {
    const rev = revenue
      .filter((r) => r.received_on.startsWith(m.key))
      .reduce((s, r) => s + Number(r.amount), 0);
    const sales = orders
      .filter((o) => o.created_at.startsWith(m.key) && o.status === "completed")
      .reduce((s, o) => s + Number(o.grand_total), 0);
    const exp = expenses
      .filter((e) => e.expense_date.startsWith(m.key))
      .reduce((s, e) => s + Number(e.amount), 0);
    return { month: m.label, revenue: rev, sales, expenses: exp };
  });

  const sourceBreakdown = React.useMemo(() => {
    const map = new Map<string, number>();
    revenue.forEach((r) => {
      const k = r.source ?? "other";
      map.set(k, (map.get(k) ?? 0) + Number(r.amount));
    });
    return Array.from(map.entries()).map(([source, amount]) => ({ source, amount }));
  }, [revenue]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl glass p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gold">Franchisee Dashboard</p>
            <h2 className="mt-1 font-display text-2xl">{franchiseeName}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {status && <Badge variant="outline" className="mr-2 border-gold/40 text-gold capitalize">{status}</Badge>}
              {joinedAt && <span>Joined {format(new Date(joinedAt), "MMM yyyy")}</span>}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">ROI yield</div>
            <div className="font-display text-3xl text-gradient-gold">{roiYieldPct.toFixed(1)}%</div>
            <div className="text-[10px] text-muted-foreground">on {formatINRCompact(investment)} invested</div>
          </div>
        </div>
      </div>

      {/* ROI Structure card — hide blocks where pct is 0 */}
      {(() => {
        const roiBlocks = [
          { label: "Base monthly ROI", value: baseRoiPct, hint: "Fixed every month" },
          { label: "Nail Emporium incentive", value: emporiumPct, hint: "On Nail Emporium sales" },
          { label: "Academy incentive", value: academyPct, hint: "On batch fees" },
          { label: "Mall of Salon Dark Store", value: darkPct, hint: "On dark store sales" },
        ].filter((b) => b.value > 0);
        if (roiBlocks.length === 0) return null;
        const gridCols =
          roiBlocks.length === 1
            ? "sm:grid-cols-1"
            : roiBlocks.length === 2
              ? "sm:grid-cols-2"
              : roiBlocks.length === 3
                ? "sm:grid-cols-2 lg:grid-cols-3"
                : "sm:grid-cols-2 lg:grid-cols-4";
        return (
          <div className="rounded-2xl glass p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-gold" />
                <h3 className="font-display text-lg">Your ROI structure</h3>
              </div>
              <Badge variant="outline" className="border-gold/40 text-gold">
                Fee {formatINRCompact(fee)}
              </Badge>
            </div>
            <div className={`grid gap-3 ${gridCols}`}>
              {roiBlocks.map((b) => (
                <RoiTile key={b.label} label={b.label} value={`${b.value}%`} hint={b.hint} />
              ))}
            </div>
          </div>
        );
      })()}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="This month revenue" value={formatINRCompact(monthRevenue + monthGross)} icon={TrendingUp} hint={`${monthOrders.length} orders`} delay={0} />
        <KpiCard label="Lifetime ROI paid" value={formatINRCompact(lifetimePaid)} icon={Wallet} hint={`${payouts.filter((p) => p.status === "paid").length} payouts`} delay={0.05} />
        <KpiCard label="Pending payouts" value={formatINRCompact(pendingPayout)} icon={Clock} hint={`${payouts.filter((p) => p.status === "pending").length} pending`} delay={0.1} />
        <KpiCard label="Total POS sales" value={formatINRCompact(grossSales)} icon={ShoppingCart} hint={`${completedOrders.length} completed`} delay={0.15} />
      </div>

      {/* P&L block */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl glass p-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">This month P&amp;L</div>
          <div className={`mt-2 font-display text-4xl ${monthPL >= 0 ? "text-gradient-gold" : "text-rose-400"}`}>
            {monthPL >= 0 ? "+" : ""}{formatINRCompact(monthPL)}
          </div>
          <div className="mt-4 space-y-1.5 text-sm">
            <PLRow label="Revenue + POS" value={formatINRCompact(monthRevenue + monthGross)} positive />
            <PLRow label="− Expenses" value={formatINRCompact(monthExpenses)} />
            <PLRow label="− ROI paid out" value={formatINRCompact(monthRoiPaid)} />
          </div>
        </div>
        <div className="rounded-2xl glass p-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Lifetime P&amp;L</div>
          <div className={`mt-2 font-display text-4xl ${lifetimePL >= 0 ? "text-gradient-gold" : "text-rose-400"}`}>
            {lifetimePL >= 0 ? "+" : ""}{formatINRCompact(lifetimePL)}
          </div>
          <div className="mt-4 space-y-1.5 text-sm">
            <PLRow label="Revenue + POS" value={formatINRCompact(totalRevenue + grossSales)} positive />
            <PLRow label="− Expenses" value={formatINRCompact(totalExpenses)} />
            <PLRow label="− ROI paid out" value={formatINRCompact(lifetimePaid)} />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl glass p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg">6-month performance</h3>
            <span className="text-xs text-muted-foreground">Revenue + POS sales vs expenses</span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c9a84c" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#c9a84c" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatINRCompact(v)} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => formatINR(v)}
                />
                <Area type="monotone" dataKey="revenue" stroke="#c9a84c" fill="url(#grRev)" strokeWidth={2} name="Revenue" />
                <Area type="monotone" dataKey="sales" stroke="#60a5fa" fill="url(#grSales)" strokeWidth={2} name="POS sales" />
                <Area type="monotone" dataKey="expenses" stroke="#f87171" fill="transparent" strokeWidth={2} strokeDasharray="4 4" name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl glass p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg">Revenue mix</h3>
            <Receipt className="h-4 w-4 text-gold" />
          </div>
          {sourceBreakdown.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No revenue recorded yet.</div>
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceBreakdown} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => formatINRCompact(v)} />
                  <YAxis type="category" dataKey="source" stroke="hsl(var(--muted-foreground))" fontSize={11} width={80} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number) => formatINR(v)}
                  />
                  <Bar dataKey="amount" fill="#c9a84c" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Equipment compliance + Inventory snapshot */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl glass p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-gold" />
              <h3 className="font-display text-lg">Equipment & premises</h3>
            </div>
            <Badge
              variant="outline"
              className={fullyCompliant ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}
            >
              {compliantCount}/{equipment.length} compliant
            </Badge>
          </div>
          <div className="space-y-2">
            {equipment.map((e) => (
              <div key={e.label} className="flex items-center justify-between rounded-lg bg-background/40 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  {e.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400" />
                  )}
                  <span>{e.label}</span>
                </div>
                <span className="text-muted-foreground">{e.value}</span>
              </div>
            ))}
          </div>
          {franchisee?.equipment_verified && franchisee?.equipment_verified_at && (
            <div className="mt-3 text-xs text-emerald-400">
              ✓ Verified by admin on {format(new Date(franchisee.equipment_verified_at), "dd MMM yyyy")}
            </div>
          )}
        </div>

        <div className="rounded-2xl glass p-6">
          <div className="mb-4 flex items-center gap-2">
            <Boxes className="h-4 w-4 text-gold" />
            <h3 className="font-display text-lg">Dark store inventory</h3>
          </div>
          {!warehouseId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No warehouse linked yet. Ask admin to assign your dark store.
            </p>
          ) : stockRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No stock recorded yet.</p>
          ) : (
            <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
              {stockRows.map((row, i) => {
                const p = row.products;
                const qty = Number(row.quantity);
                const low = qty <= Number(p?.low_stock_threshold ?? 0);
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-background/40 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{p?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{p?.sku ?? ""}</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={low ? "border-rose-500/40 text-rose-400" : "border-emerald-500/40 text-emerald-400"}
                    >
                      {qty} {low ? "· low" : ""}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Activity summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Package className="h-3.5 w-3.5" /> Orders snapshot
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Total orders" value={String(orders.length)} />
            <Row label="Completed" value={String(completedOrders.length)} />
            <Row label="Pending / draft" value={String(pendingOrders)} />
            <Row label="This month" value={String(monthOrders.length)} accent />
          </div>
        </div>
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Money in
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Lifetime revenue" value={formatINRCompact(totalRevenue + grossSales)} />
            <Row label="Recurring revenue" value={formatINRCompact(totalRevenue)} />
            <Row label="POS gross" value={formatINRCompact(grossSales)} />
            <Row label="This month" value={formatINRCompact(monthRevenue + monthGross)} accent />
          </div>
        </div>
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Money out
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Total expenses" value={formatINRCompact(totalExpenses)} />
            <Row label="ROI paid out" value={formatINRCompact(lifetimePaid)} />
            <Row label="Pending payouts" value={formatINRCompact(pendingPayout)} />
            <Row
              label="Net (rev − exp − ROI)"
              value={formatINRCompact(lifetimePL)}
              accent
            />
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="rounded-2xl glass p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">Recent orders</h3>
          <span className="text-xs text-muted-foreground">{orders.length} total</span>
        </div>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Invoice</th>
                  <th className="px-2 py-2 text-left">Customer</th>
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-center">Status</th>
                  <th className="px-2 py-2 text-center">Payment</th>
                  <th className="px-2 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 12).map((o) => (
                  <tr key={o.id} className="border-b border-border/40">
                    <td className="px-2 py-2 font-mono text-xs">{o.invoice_number ?? o.id.slice(0, 8)}</td>
                    <td className="px-2 py-2">{o.customer_name ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{format(new Date(o.created_at), "dd MMM yy")}</td>
                    <td className="px-2 py-2 text-center">
                      <Badge
                        variant="outline"
                        className={
                          o.status === "completed"
                            ? "border-emerald-500/40 text-emerald-400 capitalize"
                            : "border-amber-500/40 text-amber-400 capitalize"
                        }
                      >
                        {o.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Badge
                        variant="outline"
                        className={
                          o.payment_status === "paid"
                            ? "border-emerald-500/40 text-emerald-400 capitalize"
                            : "border-rose-500/40 text-rose-400 capitalize"
                        }
                      >
                        {o.payment_status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-gold">
                      {formatINRCompact(Number(o.grand_total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ROI payouts */}
      <div className="rounded-2xl glass p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">ROI payouts</h3>
          <span className="text-xs text-muted-foreground">{payouts.length} total</span>
        </div>
        {payouts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No payouts yet.</p>
        ) : (
          <div className="space-y-2">
            {payouts.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-background/40 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{format(new Date(p.payout_month), "MMMM yyyy")}</div>
                  <div className="text-xs text-muted-foreground">
                    Base {formatINRCompact(Number(p.base_roi))} · Emporium {formatINRCompact(Number(p.emporium_incentive))} · Academy{" "}
                    {formatINRCompact(Number(p.academy_incentive))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={
                      p.status === "paid"
                        ? "border-emerald-500/40 text-emerald-400"
                        : "border-amber-500/40 text-amber-400"
                    }
                  >
                    {p.status === "paid" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                    {p.status}
                  </Badge>
                  <div className="font-display text-lg text-gold">{formatINRCompact(Number(p.total_amount))}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "font-display text-gold" : "font-medium"}>{value}</span>
    </div>
  );
}

function PLRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={positive ? "font-medium text-emerald-400" : "font-medium"}>{value}</span>
    </div>
  );
}

function RoiTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-background/40 p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl text-gradient-gold">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}
