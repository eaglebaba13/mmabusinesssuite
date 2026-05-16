import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/format";
import { Download } from "lucide-react";
import { useMode } from "@/lib/mode-context";
import { Link } from "@tanstack/react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/app/reports")({
  head: () => ({ meta: [{ title: "Reports Center — MMA Suite" }] }),
  component: ReportsPage,
});

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function downloadCSV(name: string, rows: Record<string, unknown>[]) {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const [from, setFrom] = React.useState<string>(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 12); return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = React.useState<string>(() => new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Analytics</p>
          <h1 className="font-display text-3xl">Reports Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Group-wide revenue, ROI, incentives, invoice register and entity-wise performance.</p>
        </div>
        <div className="flex items-end gap-2">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </div>

      <Tabs defaultValue="revenue">
        <TabsList className="flex-wrap">
          <TabsTrigger value="revenue">Revenue Summary</TabsTrigger>
          <TabsTrigger value="roi">ROI Due vs Paid</TabsTrigger>
          <TabsTrigger value="incentives">Incentives</TabsTrigger>
          <TabsTrigger value="invoices">Invoice Register</TabsTrigger>
          <TabsTrigger value="entity">Entity Performance</TabsTrigger>
        </TabsList>
        <TabsContent value="revenue"><RevenueReport from={from} to={to} /></TabsContent>
        <TabsContent value="roi"><RoiReport from={from} to={to} /></TabsContent>
        <TabsContent value="incentives"><IncentiveReport from={from} to={to} /></TabsContent>
        <TabsContent value="invoices"><InvoiceRegister from={from} to={to} /></TabsContent>
        <TabsContent value="entity"><EntityPerformance /></TabsContent>
      </Tabs>
    </div>
  );
}

function RevenueReport({ from, to }: { from: string; to: string }) {
  const q = useQuery({
    queryKey: ["rep-rev", from, to],
    queryFn: async () => (await supabase.from("revenue_entries").select("source,amount,received_on").gte("received_on", from).lte("received_on", to)).data,
  });
  const rows = q.data ?? [];
  const bySource = Object.entries(rows.reduce<Record<string, number>>((a, r) => {
    a[r.source] = (a[r.source] ?? 0) + Number(r.amount); return a;
  }, {})).map(([source, total]) => ({ source, total }));
  const totalSum = bySource.reduce((s, r) => s + r.total, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Revenue by Source · {formatINR(totalSum)}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => downloadCSV("revenue-summary", bySource.map((r) => ({ source: r.source, total: r.total })))}><Download className="mr-1 h-3 w-3" /> CSV</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Entries</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">% Mix</TableHead></TableRow></TableHeader>
          <TableBody>
            {bySource.sort((a, b) => b.total - a.total).map((r) => (
              <TableRow key={r.source}>
                <TableCell className="capitalize">{r.source.replace("_", " ")}</TableCell>
                <TableCell>{rows.filter((x) => x.source === r.source).length}</TableCell>
                <TableCell className="text-right font-mono">{formatINR(r.total)}</TableCell>
                <TableCell className="text-right">{totalSum > 0 ? ((r.total / totalSum) * 100).toFixed(1) : "0"}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RoiReport({ from, to }: { from: string; to: string }) {
  const q = useQuery({
    queryKey: ["rep-roi", from, to],
    queryFn: async () => (await supabase.from("state_franchise_roi_ledger").select("*,state_franchises(full_name,state)").gte("period_month", from).lte("period_month", to)).data,
  });
  const cityQ = useQuery({
    queryKey: ["rep-roi-city", from, to],
    queryFn: async () => (await supabase.from("roi_payouts").select("*,franchisees(full_name)").gte("payout_month", from).lte("payout_month", to)).data,
  });
  const rows = (q.data ?? []) as any[];
  const cityRows = (cityQ.data ?? []) as any[];
  const stateDue = rows.reduce((s, r) => s + (Number(r.roi_due) - Number(r.paid_amount)), 0);
  const statePaid = rows.reduce((s, r) => s + Number(r.paid_amount), 0);
  const cityDue = cityRows.filter((r) => r.status !== "paid").reduce((s, r) => s + Number(r.total_amount), 0);
  const cityPaid = cityRows.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.total_amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="State ROI Due" value={formatINR(stateDue)} />
        <Kpi label="State ROI Paid" value={formatINR(statePaid)} />
        <Kpi label="City ROI Due" value={formatINR(cityDue)} />
        <Kpi label="City ROI Paid" value={formatINR(cityPaid)} />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">State Franchise ROI Ledger</CardTitle>
          <Button size="sm" variant="outline" onClick={() => downloadCSV("state-roi", rows.map((r) => ({ state: r.state_franchises?.full_name, month: r.period_month, basis: r.basis_amount, pct: r.roi_pct, due: r.roi_due, paid: r.paid_amount, status: r.status })))}><Download className="mr-1 h-3 w-3" /> CSV</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>State Partner</TableHead><TableHead>Month</TableHead><TableHead>Basis</TableHead><TableHead>%</TableHead><TableHead>Due</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.state_franchises?.full_name ?? "—"}</TableCell>
                  <TableCell>{r.period_month}</TableCell>
                  <TableCell>{formatINR(r.basis_amount)}</TableCell>
                  <TableCell>{r.roi_pct}%</TableCell>
                  <TableCell>{formatINR(r.roi_due)}</TableCell>
                  <TableCell>{formatINR(r.paid_amount)}</TableCell>
                  <TableCell><Badge variant={r.status === "paid" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function IncentiveReport({ from, to }: { from: string; to: string }) {
  const q = useQuery({
    queryKey: ["rep-inc", from, to],
    queryFn: async () => (await supabase.from("state_franchise_incentive_ledger").select("*,state_franchises(full_name)").gte("period_month", from).lte("period_month", to)).data,
  });
  const rows = (q.data ?? []) as any[];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const paid = rows.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.amount), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Incentives · Accrued {formatINR(total)} · Paid {formatINR(paid)}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => downloadCSV("incentives", rows.map((r) => ({ partner: r.state_franchises?.full_name, month: r.period_month, kind: r.kind, basis: r.basis_amount, pct: r.pct, amount: r.amount, status: r.status })))}><Download className="mr-1 h-3 w-3" /> CSV</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Partner</TableHead><TableHead>Month</TableHead><TableHead>Kind</TableHead><TableHead>Basis</TableHead><TableHead>%</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.state_franchises?.full_name ?? "—"}</TableCell>
                <TableCell>{r.period_month}</TableCell>
                <TableCell className="capitalize">{r.kind?.replace("_", " ")}</TableCell>
                <TableCell>{r.basis_amount ? formatINR(r.basis_amount) : "—"}</TableCell>
                <TableCell>{r.pct ? `${r.pct}%` : "—"}</TableCell>
                <TableCell>{formatINR(r.amount)}</TableCell>
                <TableCell><Badge variant={r.status === "paid" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function InvoiceRegister({ from, to }: { from: string; to: string }) {
  const { isTesting } = useMode();
  const [companyId, setCompanyId] = React.useState<string>("all");
  const [status, setStatus] = React.useState<string>("all");
  const compQ = useQuery({ queryKey: ["rep-inv-companies"], queryFn: async () => (await supabase.from("companies").select("id,name").eq("active", true).order("name")).data });
  const q = useQuery({
    queryKey: ["rep-inv", from, to, isTesting, companyId, status],
    queryFn: async () => {
      let qb = supabase.from("invoices")
        .select("id,invoice_number,doc_type,invoice_date,bill_to_name,subtotal,gst_total,grand_total,amount_paid,status,payment_status,companies!company_id(name)")
        .eq("is_demo", isTesting)
        .gte("invoice_date", from).lte("invoice_date", to)
        .order("invoice_date", { ascending: false });
      if (companyId !== "all") qb = qb.eq("company_id", companyId);
      if (status !== "all") qb = qb.eq("status", status as any);
      return (await qb).data;
    },
  });
  const rows = (q.data ?? []) as any[];
  const total = rows.reduce((s, r) => s + Number(r.grand_total), 0);
  const paid = rows.reduce((s, r) => s + Number(r.amount_paid), 0);
  const outstanding = total - paid;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Documents" value={`${rows.length}`} />
        <Kpi label="Billed" value={formatINR(total)} />
        <Kpi label="Collected" value={formatINR(paid)} />
        <Kpi label="Outstanding" value={formatINR(outstanding)} />
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Invoice Register</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="h-8 w-48"><SelectValue placeholder="All companies" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {compQ.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                {["all", "draft", "issued", "paid", "partial", "cancelled", "revised"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => downloadCSV("invoice-register", rows.map((r) => ({ number: r.invoice_number, type: r.doc_type, date: r.invoice_date, from: r.companies?.name, to: r.bill_to_name, subtotal: r.subtotal, gst: r.gst_total, total: r.grand_total, paid: r.amount_paid, status: r.status, payment: r.payment_status })))}><Download className="mr-1 h-3 w-3" /> CSV</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs"><Link to="/app/billing/invoices/$invoiceId" params={{ invoiceId: r.id }} className="hover:underline">{r.invoice_number ?? "DRAFT"}</Link></TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{r.doc_type}</Badge></TableCell>
                  <TableCell>{r.invoice_date}</TableCell>
                  <TableCell>{r.companies?.name ?? "—"}</TableCell>
                  <TableCell>{r.bill_to_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatINR(r.grand_total)}</TableCell>
                  <TableCell className="text-right">{formatINR(r.amount_paid)}</TableCell>
                  <TableCell><Badge variant={r.payment_status === "paid" ? "default" : "secondary"}>{r.payment_status}</Badge></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No invoices in this range</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function EntityPerformance() {
  const frQ = useQuery({ queryKey: ["rep-entities-fr"], queryFn: async () => (await supabase.from("franchisees").select("id,full_name,investment_amount,joined_at,status")).data });
  const revQ = useQuery({ queryKey: ["rep-entities-rev"], queryFn: async () => (await supabase.from("revenue_entries").select("franchisee_id,amount")).data });
  const roiQ = useQuery({ queryKey: ["rep-entities-roi"], queryFn: async () => (await supabase.from("roi_payouts").select("franchisee_id,total_amount,status")).data });

  const frs = frQ.data ?? [];
  const rev = revQ.data ?? [];
  const roi = roiQ.data ?? [];
  const rows = frs.map((f) => {
    const fRev = rev.filter((r) => r.franchisee_id === f.id).reduce((a, r) => a + Number(r.amount), 0);
    const fRoiPaid = roi.filter((r) => r.franchisee_id === f.id && r.status === "paid").reduce((a, r) => a + Number(r.total_amount), 0);
    const fRoiDue = roi.filter((r) => r.franchisee_id === f.id && r.status !== "paid").reduce((a, r) => a + Number(r.total_amount), 0);
    return { id: f.id, name: f.full_name, investment: Number(f.investment_amount), revenue: fRev, roi_paid: fRoiPaid, roi_due: fRoiDue, status: f.status };
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Franchisee Performance</CardTitle>
        <Button size="sm" variant="outline" onClick={() => downloadCSV("entity-performance", rows)}><Download className="mr-1 h-3 w-3" /> CSV</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Franchisee</TableHead><TableHead>Investment</TableHead><TableHead>Revenue</TableHead><TableHead>ROI Paid</TableHead><TableHead>ROI Due</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.sort((a, b) => b.revenue - a.revenue).map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell>{formatINR(r.investment)}</TableCell>
                <TableCell>{formatINR(r.revenue)}</TableCell>
                <TableCell>{formatINR(r.roi_paid)}</TableCell>
                <TableCell>{formatINR(r.roi_due)}</TableCell>
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl">{value}</p></CardContent></Card>;
}
