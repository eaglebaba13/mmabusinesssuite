import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR } from "@/lib/format";

export const Route = createFileRoute("/app/accounts")({
  head: () => ({ meta: [{ title: "Accounts — MMA Suite" }] }),
  component: AccountsPage,
});

function AccountsPage() {
  return (
    <div className="space-y-4 p-4 md:p-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-gold">Accounts</p>
        <h1 className="font-display text-3xl">Accounts Workflow</h1>
        <p className="mt-1 text-sm text-muted-foreground">Payments, receivables, payables and company ledgers across all entities.</p>
      </div>
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="payables">Payables</TabsTrigger>
          <TabsTrigger value="ledgers">Company Ledgers</TabsTrigger>
        </TabsList>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
        <TabsContent value="receivables"><ReceivablesTab /></TabsContent>
        <TabsContent value="payables"><PayablesTab /></TabsContent>
        <TabsContent value="ledgers"><LedgersTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function PaymentsTab() {
  const q = useQuery({
    queryKey: ["acct-payments"],
    queryFn: async () => (await supabase.from("payments").select("*,companies!company_id(name)").order("payment_date", { ascending: false }).limit(500)).data,
  });
  const rows = (q.data ?? []) as any[];
  const inflow = rows.filter((r) => r.direction === "inflow").reduce((s, r) => s + Number(r.amount), 0);
  const outflow = rows.filter((r) => r.direction === "outflow").reduce((s, r) => s + Number(r.amount), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Inflow" value={formatINR(inflow)} />
        <Kpi label="Outflow" value={formatINR(outflow)} />
        <Kpi label="Net" value={formatINR(inflow - outflow)} />
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Company</TableHead><TableHead>Direction</TableHead><TableHead>Counterparty</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.payment_date}</TableCell>
                <TableCell>{r.companies?.name ?? "—"}</TableCell>
                <TableCell><Badge variant={r.direction === "inflow" ? "default" : "secondary"}>{r.direction}</Badge></TableCell>
                <TableCell>{r.counterparty_name ?? "—"}</TableCell>
                <TableCell className="capitalize">{r.method.replace("_", " ")}</TableCell>
                <TableCell className="font-mono">{formatINR(r.amount)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.reference ?? "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No payments recorded</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

function ReceivablesTab() {
  const q = useQuery({
    queryKey: ["acct-rec"],
    queryFn: async () => (await supabase.from("invoices").select("id,invoice_number,invoice_date,due_date,bill_to_name,grand_total,amount_paid,payment_status,companies!company_id(name)").neq("status", "draft").neq("status", "cancelled").order("due_date", { ascending: true, nullsFirst: false })).data,
  });
  const rows = ((q.data ?? []) as any[]).filter((r) => Number(r.grand_total) > Number(r.amount_paid));
  const total = rows.reduce((s, r) => s + (Number(r.grand_total) - Number(r.amount_paid)), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = rows.filter((r) => r.due_date && r.due_date < today).reduce((s, r) => s + (Number(r.grand_total) - Number(r.amount_paid)), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Outstanding" value={formatINR(total)} />
        <Kpi label="Overdue" value={formatINR(overdue)} />
        <Kpi label="Open Invoices" value={`${rows.length}`} />
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Due</TableHead><TableHead>From</TableHead><TableHead>Customer</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Outstanding</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => {
              const open = Number(r.grand_total) - Number(r.amount_paid);
              const isOverdue = r.due_date && r.due_date < today;
              return (
                <TableRow key={r.id} className={isOverdue ? "bg-destructive/5" : ""}>
                  <TableCell className="font-mono text-xs">{r.invoice_number ?? "—"}</TableCell>
                  <TableCell>{r.invoice_date}</TableCell>
                  <TableCell className={isOverdue ? "text-destructive font-semibold" : ""}>{r.due_date ?? "—"}</TableCell>
                  <TableCell>{r.companies?.name ?? "—"}</TableCell>
                  <TableCell>{r.bill_to_name ?? "—"}</TableCell>
                  <TableCell>{formatINR(r.grand_total)}</TableCell>
                  <TableCell>{formatINR(r.amount_paid)}</TableCell>
                  <TableCell className="font-mono font-semibold">{formatINR(open)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

function PayablesTab() {
  const q = useQuery({
    queryKey: ["acct-payables"],
    queryFn: async () => (await supabase.from("expenses").select("id,expense_date,vendor,description,amount,status,payment_method,franchisees(full_name)").order("expense_date", { ascending: false }).limit(500)).data,
  });
  const rows = (q.data ?? []) as any[];
  const due = rows.filter((r) => r.status !== "paid").reduce((s, r) => s + Number(r.amount), 0);
  const paid = rows.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.amount), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Payables Due" value={formatINR(due)} />
        <Kpi label="Paid (LTD)" value={formatINR(paid)} />
        <Kpi label="Records" value={`${rows.length}`} />
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead>Description</TableHead><TableHead>Franchisee</TableHead><TableHead>Method</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.expense_date}</TableCell>
                <TableCell>{r.vendor ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate text-xs">{r.description ?? "—"}</TableCell>
                <TableCell>{r.franchisees?.full_name ?? "—"}</TableCell>
                <TableCell className="capitalize text-xs">{r.payment_method.replace("_", " ")}</TableCell>
                <TableCell className="font-mono">{formatINR(r.amount)}</TableCell>
                <TableCell><Badge variant={r.status === "paid" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

function LedgersTab() {
  const compQ = useQuery({ queryKey: ["acct-companies"], queryFn: async () => (await supabase.from("companies").select("id,name,brand").eq("active", true).order("name")).data });
  const [companyId, setCompanyId] = React.useState<string>("");
  React.useEffect(() => { if (!companyId && compQ.data?.[0]) setCompanyId(compQ.data[0].id); }, [compQ.data, companyId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Pick company" /></SelectTrigger>
          <SelectContent>{compQ.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {companyId && <CompanyLedger companyId={companyId} />}
    </div>
  );
}

function CompanyLedger({ companyId }: { companyId: string }) {
  const invQ = useQuery({ queryKey: ["ledger-inv", companyId], queryFn: async () => (await supabase.from("invoices").select("id,invoice_date,invoice_number,doc_type,grand_total,amount_paid,bill_to_name").eq("company_id", companyId).neq("status", "draft").order("invoice_date", { ascending: false })).data });
  const payQ = useQuery({ queryKey: ["ledger-pay", companyId], queryFn: async () => (await supabase.from("payments").select("id,payment_date,direction,amount,counterparty_name,reference,method").eq("company_id", companyId).order("payment_date", { ascending: false })).data });

  const inv = (invQ.data ?? []) as any[];
  const pay = (payQ.data ?? []) as any[];
  type Entry = { date: string; type: "Invoice" | "Payment In" | "Payment Out"; ref: string; party: string; debit: number; credit: number };
  const entries: Entry[] = [
    ...inv.map<Entry>((i) => ({ date: i.invoice_date, type: "Invoice", ref: i.invoice_number ?? `DRAFT-${i.id.slice(0, 6)}`, party: i.bill_to_name ?? "—", debit: Number(i.grand_total), credit: 0 })),
    ...pay.map<Entry>((p) => ({ date: p.payment_date, type: p.direction === "inflow" ? "Payment In" : "Payment Out", ref: p.reference ?? "—", party: p.counterparty_name ?? "—", debit: p.direction === "outflow" ? Number(p.amount) : 0, credit: p.direction === "inflow" ? Number(p.amount) : 0 })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  let running = 0;
  const withBalance = entries.slice().reverse().map((e) => { running += e.debit - e.credit; return { ...e, balance: running }; }).reverse();

  return (
    <Card><CardContent className="overflow-x-auto p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead>Party</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
        <TableBody>
          {withBalance.map((e, i) => (
            <TableRow key={i}>
              <TableCell>{e.date}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{e.type}</Badge></TableCell>
              <TableCell className="font-mono text-xs">{e.ref}</TableCell>
              <TableCell>{e.party}</TableCell>
              <TableCell className="text-right font-mono">{e.debit ? formatINR(e.debit) : "—"}</TableCell>
              <TableCell className="text-right font-mono">{e.credit ? formatINR(e.credit) : "—"}</TableCell>
              <TableCell className="text-right font-mono font-semibold">{formatINR(e.balance)}</TableCell>
            </TableRow>
          ))}
          {withBalance.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No ledger entries</TableCell></TableRow>}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl">{value}</p></CardContent></Card>;
}
