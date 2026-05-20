import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Receipt, Search, ShoppingBag, IndianRupee, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard } from "@/components/app/KpiCard";
import { ExportBar } from "@/components/app/ExportBar";
import { exportToCSV, exportToPDF, defaultDateRange, inDateRange } from "@/lib/export";
import { formatINR, formatINRCompact } from "@/lib/format";

export const Route = createFileRoute("/app/pos/orders")({
  component: OrdersPage,
});

const STATUS_COLOR: Record<string, string> = {
  draft: "border-slate-400/40 text-slate-400",
  completed: "border-emerald-400/40 text-emerald-400",
  cancelled: "border-rose-400/40 text-rose-400",
  refunded: "border-amber-400/40 text-amber-400",
};

const PAY_COLOR: Record<string, string> = {
  unpaid: "border-rose-400/40 text-rose-400",
  partial: "border-amber-400/40 text-amber-400",
  paid: "border-emerald-400/40 text-emerald-400",
  refunded: "border-slate-400/40 text-slate-400",
};

function OrdersPage() {
  const def = defaultDateRange();
  const [from, setFrom] = React.useState(def.from);
  const [to, setTo] = React.useState(def.to);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [payFilter, setPayFilter] = React.useState<string>("all");
  const [franchiseeFilter, setFranchiseeFilter] = React.useState<string>("all");
  const [createdByFilter, setCreatedByFilter] = React.useState<string>("all");

  const orders = useQuery({
    queryKey: ["pos-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_orders")
        .select("*, warehouses(name, city, franchisees(id, full_name))")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  // Resolve served_by user ids → display names in one batch
  const servedByIds = React.useMemo(() => {
    const ids = new Set<string>();
    (orders.data ?? []).forEach((o: any) => o.served_by && ids.add(o.served_by));
    return Array.from(ids);
  }, [orders.data]);

  const operators = useQuery({
    queryKey: ["pos-operators", servedByIds.join(",")],
    enabled: servedByIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", servedByIds);
      const map = new Map<string, { full_name: string | null; email: string | null }>();
      (data ?? []).forEach((p: any) => map.set(p.id, { full_name: p.full_name, email: p.email }));
      return map;
    },
  });

  const operatorName = (id: string | null) => {
    if (!id) return "—";
    const p = operators.data?.get(id);
    return p?.full_name ?? p?.email ?? id.slice(0, 8);
  };

  const franchiseeOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    (orders.data ?? []).forEach((o: any) => {
      const f = o.warehouses?.franchisees;
      if (f?.id) map.set(f.id, f.full_name ?? "Unnamed");
    });
    return Array.from(map.entries());
  }, [orders.data]);

  const filtered = (orders.data ?? []).filter((o: any) => {
    if (!inDateRange(o.created_at, from, to)) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (payFilter !== "all" && o.payment_status !== payFilter) return false;
    if (franchiseeFilter !== "all" && o.warehouses?.franchisees?.id !== franchiseeFilter) return false;
    if (createdByFilter !== "all" && o.served_by !== createdByFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (o.invoice_number ?? "").toLowerCase().includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.customer_phone ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const completed = filtered.filter((o: any) => o.status === "completed");
  const totalRevenue = completed.reduce((s: number, o: any) => s + Number(o.grand_total ?? 0), 0);
  const gstCollected = completed.reduce((s: number, o: any) => s + Number(o.gst_total ?? 0), 0);
  const avgTicket = completed.length > 0 ? totalRevenue / completed.length : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Orders" value={String(filtered.length)} icon={ShoppingBag} delay={0} />
        <KpiCard label="Revenue" value={formatINRCompact(totalRevenue)} icon={IndianRupee} delay={0.05} />
        <KpiCard label="GST Collected" value={formatINRCompact(gstCollected)} icon={Receipt} delay={0.1} />
        <KpiCard label="Avg Ticket" value={formatINRCompact(avgTicket)} icon={TrendingUp} delay={0.15} />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/30 p-3 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-44" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-44" />
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search invoice no, customer name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={payFilter} onValueChange={setPayFilter}>
          <SelectTrigger className="sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={franchiseeFilter} onValueChange={setFranchiseeFilter}>
          <SelectTrigger className="sm:w-[180px]"><SelectValue placeholder="Franchisee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All franchisees</SelectItem>
            {franchiseeOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={createdByFilter} onValueChange={setCreatedByFilter}>
          <SelectTrigger className="sm:w-[180px]"><SelectValue placeholder="Created by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All operators</SelectItem>
            {servedByIds.map((id) => (
              <SelectItem key={id} value={id}>{operatorName(id)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>


      <ExportBar
        from=""
        to=""
        onFromChange={() => {}}
        onToChange={() => {}}
        showDateRange={false}
        count={filtered.length}
        onCSV={() =>
          exportToCSV(`pos-orders-${from}-to-${to}`, filtered, [
            { header: "Invoice", accessor: (r: any) => r.invoice_number ?? "—" },
            { header: "Date", accessor: (r: any) => new Date(r.created_at).toLocaleString("en-IN") },
            { header: "Franchisee", accessor: (r: any) => r.warehouses?.franchisees?.full_name ?? "" },
            { header: "Outlet", accessor: (r: any) => r.warehouses?.name ?? "" },
            { header: "City", accessor: (r: any) => r.warehouses?.city ?? "" },
            { header: "Created By", accessor: (r: any) => operatorName(r.served_by) },
            { header: "Customer", accessor: (r: any) => r.customer_name ?? "Walk-in" },
            { header: "Phone", accessor: (r: any) => r.customer_phone ?? "" },
            { header: "Subtotal", accessor: (r: any) => Number(r.subtotal) },
            { header: "GST", accessor: (r: any) => Number(r.gst_total) },
            { header: "Total", accessor: (r: any) => Number(r.grand_total) },
            { header: "Status", accessor: (r: any) => r.status },
            { header: "Payment", accessor: (r: any) => r.payment_status },
          ])
        }
        onPDF={() =>
          exportToPDF({
            filename: `pos-orders-${from}-to-${to}`,
            title: `POS Orders ${from} → ${to}`,
            rows: filtered,
            columns: [
              { header: "Invoice", accessor: (r: any) => r.invoice_number ?? "—" },
              { header: "Date", accessor: (r: any) => new Date(r.created_at).toLocaleString("en-IN") },
              { header: "Customer", accessor: (r: any) => r.customer_name ?? "Walk-in" },
              { header: "GST", accessor: (r: any) => formatINR(Number(r.gst_total)) },
              { header: "Total", accessor: (r: any) => formatINR(Number(r.grand_total)) },
              { header: "Status", accessor: (r: any) => r.status },
              { header: "Payment", accessor: (r: any) => r.payment_status },
            ],
            totals: [
              { label: "Total revenue", value: formatINR(totalRevenue) },
              { label: "GST collected", value: formatINR(gstCollected) },
            ],
          })
        }
      />

      <div className="rounded-2xl glass overflow-hidden">
        {orders.isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No orders match your filters.</div>
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map((o: any) => (
              <Link
                key={o.id}
                to="/app/pos/orders/$orderId"
                params={{ orderId: o.id }}
                className="grid grid-cols-12 items-center gap-2 p-3 text-sm transition-colors hover:bg-foreground/5"
              >
                <div className="col-span-2">
                  <p className="font-mono font-medium text-gold">{o.invoice_number ?? "Draft"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="truncate font-medium">{o.warehouses?.franchisees?.full_name ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.warehouses?.name ?? "—"}
                    {o.warehouses?.city ? ` · ${o.warehouses.city}` : ""}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="truncate font-medium">{o.customer_name ?? "Walk-in"}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.customer_phone ?? "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="truncate text-xs">{operatorName(o.served_by)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Created by</p>
                </div>
                <div className="col-span-2 text-right font-semibold text-gold">
                  {formatINR(Number(o.grand_total))}
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <Badge variant="outline" className={STATUS_COLOR[o.status] ?? ""}>
                    {o.status}
                  </Badge>
                  <Badge variant="outline" className={PAY_COLOR[o.payment_status] ?? ""}>
                    {o.payment_status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
