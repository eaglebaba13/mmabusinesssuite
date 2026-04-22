import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/app/KpiCard";
import { Wallet, Clock, AlertCircle, Receipt } from "lucide-react";
import { formatINR, formatINRCompact } from "@/lib/format";

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
  const fees = useQuery({
    queryKey: ["fees-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_payments")
        .select("*, enrollments(students(full_name), batches(batch_code))")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const list = fees.data ?? [];
  const collected = list.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  const pending = list.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);
  const overdue = list.filter((p) => p.status === "overdue").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl">Fee Ledger</h2>
        <p className="text-sm text-muted-foreground">Payments, dues and reconciliation.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard label="Collected" value={formatINRCompact(collected)} icon={Wallet} />
        <KpiCard label="Pending" value={formatINRCompact(pending)} icon={Clock} delay={0.05} />
        <KpiCard label="Overdue" value={formatINRCompact(overdue)} icon={AlertCircle} delay={0.1} />
        <KpiCard label="Receipts" value={String(list.filter((p) => p.status === "paid").length)} icon={Receipt} delay={0.15} />
      </div>
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
