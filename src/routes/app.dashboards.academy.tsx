import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";

export const Route = createFileRoute("/app/dashboards/academy")({
  head: () => ({ meta: [{ title: "Academy Dashboard — MMA Suite" }] }),
  component: AcademyDash,
});

function AcademyDash() {
  const batchQ = useQuery({ queryKey: ["dash-batches"], queryFn: async () => (await supabase.from("batches").select("id,batch_code,status,capacity,start_date,courses(title,fee_amount)").order("start_date", { ascending: false }).limit(50)).data });
  const enrollQ = useQuery({ queryKey: ["dash-enrollments"], queryFn: async () => (await supabase.from("enrollments").select("id,status,total_fee,enrolled_on,batch_id").limit(500)).data });
  const feeQ = useQuery({ queryKey: ["dash-fees"], queryFn: async () => (await supabase.from("fee_payments").select("amount,status,paid_on").limit(500)).data });

  const enrollments = enrollQ.data ?? [];
  const fees = feeQ.data ?? [];
  const activeEnrollments = enrollments.filter((e) => e.status === "active").length;
  const totalRevenue = enrollments.reduce((s, e) => s + Number(e.total_fee), 0);
  const collected = fees.filter((f) => f.status === "paid").reduce((s, f) => s + Number(f.amount), 0);
  const outstanding = totalRevenue - collected;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active Enrollments" value={`${activeEnrollments}`} />
        <Kpi label="Total Revenue" value={formatINR(totalRevenue)} />
        <Kpi label="Collected" value={formatINR(collected)} />
        <Kpi label="Outstanding" value={formatINR(outstanding)} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Batches</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Course</TableHead><TableHead>Fee</TableHead><TableHead>Capacity</TableHead><TableHead>Enrolled</TableHead><TableHead>Start</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {(batchQ.data ?? []).map((b: any) => {
                const enrolled = enrollments.filter((e) => e.batch_id === b.id).length;
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.batch_code}</TableCell>
                    <TableCell>{b.courses?.title ?? "—"}</TableCell>
                    <TableCell>{formatINR(b.courses?.fee_amount)}</TableCell>
                    <TableCell>{b.capacity}</TableCell>
                    <TableCell>{enrolled}</TableCell>
                    <TableCell>{b.start_date}</TableCell>
                    <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl">{value}</p></CardContent></Card>;
}
