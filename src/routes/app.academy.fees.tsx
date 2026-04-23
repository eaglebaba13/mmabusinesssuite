import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/app/KpiCard";
import { Wallet, Clock, AlertCircle, Receipt } from "lucide-react";
import { formatINR, formatINRCompact } from "@/lib/format";
import { ExportBar } from "@/components/app/ExportBar";
import { defaultDateRange, exportToCSV, exportToPDF, inDateRange } from "@/lib/export";
import { ImportButton } from "@/components/app/ImportButton";

export const Route = createFileRoute("/app/academy/fees")({
  head: () => ({ meta: [{ title: "Fees — Academy" }] }),
  component: FeesPage,
});

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-400",
  pending: "bg-amber-500/15 text-amber-400",
  partial: "bg-blue-500/15 text-blue-400",
  overdue: "bg-rose-500/15 text-rose-400",
  waived: "bg-muted text-muted-foreground",
};

function FeesPage() {
  const [range, setRange] = React.useState(defaultDateRange());

  const fees = useQuery({
    queryKey: ["fees-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_payments")
        .select("*, enrollments(students(full_name), batches(batch_code))")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  const list = (fees.data ?? []).filter((p: any) =>
    inDateRange(p.paid_on ?? p.due_on ?? p.created_at, range.from, range.to),
  );
  const collected = list.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.amount), 0);
  const pending = list.filter((p: any) => p.status === "pending").reduce((s: number, p: any) => s + Number(p.amount), 0);
  const overdue = list.filter((p: any) => p.status === "overdue").reduce((s: number, p: any) => s + Number(p.amount), 0);

  const exportCols = [
    { header: "Receipt", accessor: (p: any) => p.receipt_number ?? "" },
    { header: "Student", accessor: (p: any) => p.enrollments?.students?.full_name ?? "" },
    { header: "Batch", accessor: (p: any) => p.enrollments?.batches?.batch_code ?? "" },
    { header: "Amount", accessor: (p: any) => Number(p.amount) },
    { header: "Method", accessor: (p: any) => p.method ?? "" },
    { header: "Paid On", accessor: (p: any) => p.paid_on ?? "" },
    { header: "Due On", accessor: (p: any) => p.due_on ?? "" },
    { header: "Status", accessor: (p: any) => p.status },
  ];
  const fileBase = `fees_${range.from}_to_${range.to}`;
  const onCSV = () => exportToCSV(fileBase, list, exportCols);
  const onPDF = () =>
    exportToPDF({
      filename: fileBase,
      title: "Academy Fee Ledger",
      subtitle: `${range.from} → ${range.to}`,
      rows: list,
      columns: exportCols,
      totals: [
        { label: "Collected", value: formatINR(collected) },
        { label: "Pending", value: formatINR(pending) },
        { label: "Overdue", value: formatINR(overdue) },
        { label: "Receipts", value: String(list.filter((p: any) => p.status === "paid").length) },
      ],
    });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-xl">Fee Ledger</h2>
          <p className="text-sm text-muted-foreground">Payments, dues and reconciliation.</p>
        </div>
        <ImportButton configKey="fee_payments" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard label="Collected" value={formatINRCompact(collected)} icon={Wallet} />
        <KpiCard label="Pending" value={formatINRCompact(pending)} icon={Clock} delay={0.05} />
        <KpiCard label="Overdue" value={formatINRCompact(overdue)} icon={AlertCircle} delay={0.1} />
        <KpiCard label="Receipts" value={String(list.filter((p: any) => p.status === "paid").length)} icon={Receipt} delay={0.15} />
      </div>
      <ExportBar
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onCSV={onCSV}
        onPDF={onPDF}
        count={list.length}
      />
      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.receipt_number ?? "—"}</TableCell>
                <TableCell>{p.enrollments?.students?.full_name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{p.enrollments?.batches?.batch_code ?? "—"}</TableCell>
                <TableCell className="font-medium">{formatINR(Number(p.amount))}</TableCell>
                <TableCell className="capitalize">{p.method}</TableCell>
                <TableCell className="text-xs">{p.paid_on ?? <span className="text-muted-foreground">due {p.due_on}</span>}</TableCell>
                <TableCell><Badge className={STATUS_STYLES[p.status]}>{p.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
