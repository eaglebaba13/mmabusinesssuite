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
import { OpenDashboardButton } from "@/components/app/OpenDashboardButton";

export const Route = createFileRoute("/app/payouts/state")({
  head: () => ({ meta: [{ title: "State Payouts — MMA Suite" }] }),
  component: StatePayoutsPage,
});

function StatePayoutsPage() {
  const sfQ = useQuery({ queryKey: ["state-franchises-list"], queryFn: async () => (await supabase.from("state_franchises").select("id,full_name,state").order("full_name")).data });
  const [sfId, setSfId] = React.useState<string>("");

  React.useEffect(() => { if (!sfId && sfQ.data?.[0]) setSfId(sfQ.data[0].id); }, [sfQ.data, sfId]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Finance</p>
          <h1 className="font-display text-3xl">State Franchise Payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">ROI accruals, incentives, activation targets and payout statements per state.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sfId} onValueChange={setSfId}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Pick state franchise" /></SelectTrigger>
            <SelectContent>
              {sfQ.data?.map((sf) => <SelectItem key={sf.id} value={sf.id}>{sf.full_name} — {sf.state}</SelectItem>)}
            </SelectContent>
          </Select>
          {sfId && <OpenDashboardButton entity_type="state_franchise" entity_id={sfId} label="Open in new tab" />}
        </div>
      </div>

      {sfId && <StateContent stateFranchiseId={sfId} />}
    </div>
  );
}

function StateContent({ stateFranchiseId }: { stateFranchiseId: string }) {
  const roiQ = useQuery({ queryKey: ["roi-ledger", stateFranchiseId], queryFn: async () => (await supabase.from("state_franchise_roi_ledger").select("*").eq("state_franchise_id", stateFranchiseId).order("period_month", { ascending: false })).data });
  const incQ = useQuery({ queryKey: ["inc-ledger", stateFranchiseId], queryFn: async () => (await supabase.from("state_franchise_incentive_ledger").select("*").eq("state_franchise_id", stateFranchiseId).order("period_month", { ascending: false })).data });
  const tgtQ = useQuery({ queryKey: ["sf-targets", stateFranchiseId], queryFn: async () => (await supabase.from("state_franchise_targets").select("*").eq("state_franchise_id", stateFranchiseId).order("contract_year")).data });

  const roi = roiQ.data ?? [];
  const inc = incQ.data ?? [];
  const tgt = tgtQ.data?.[0];

  const roiDue = roi.filter((r) => r.status !== "paid").reduce((s, r) => s + Number(r.roi_due) - Number(r.paid_amount), 0);
  const roiPaid = roi.reduce((s, r) => s + Number(r.paid_amount), 0);
  const incTotal = inc.reduce((s, r) => s + Number(r.amount), 0);
  const incPaid = inc.reduce((s, r) => s + Number(r.paid_amount), 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="ROI Due" value={formatINR(roiDue)} />
        <Kpi label="ROI Paid (LTD)" value={formatINR(roiPaid)} />
        <Kpi label="Incentives Accrued" value={formatINR(incTotal)} />
        <Kpi label="Incentives Paid" value={formatINR(incPaid)} />
      </div>

      {tgt && (
        <Card>
          <CardHeader><CardTitle className="text-base">Activation Target — Year {tgt.contract_year}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-2 rounded-full bg-gradient-gold" style={{ width: `${Math.min(100, (tgt.activated_count / tgt.target_count) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{tgt.activated_count} of {tgt.target_count} activations · {formatINR(Number(tgt.per_activation_amount))} each · {tgt.starts_on} → {tgt.ends_on}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="roi">
        <TabsList>
          <TabsTrigger value="roi">ROI Ledger</TabsTrigger>
          <TabsTrigger value="incentives">Incentive Ledger</TabsTrigger>
          <TabsTrigger value="statement">Payout Statement</TabsTrigger>
        </TabsList>
        <TabsContent value="roi">
          <Card><CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Basis</TableHead><TableHead>%</TableHead><TableHead>Due</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {roi.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.period_month).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</TableCell>
                    <TableCell>{formatINR(r.basis_amount)}</TableCell>
                    <TableCell>{r.roi_pct}%</TableCell>
                    <TableCell>{formatINR(r.roi_due)}</TableCell>
                    <TableCell>{formatINR(r.paid_amount)}</TableCell>
                    <TableCell><Badge variant={r.status === "paid" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.notes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="incentives">
          <Card><CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Kind</TableHead><TableHead>Basis</TableHead><TableHead>%</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {inc.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.period_month).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</TableCell>
                    <TableCell className="capitalize">{r.kind.replace("_", " ")}</TableCell>
                    <TableCell>{r.basis_amount ? formatINR(r.basis_amount) : "—"}</TableCell>
                    <TableCell>{r.pct ? `${r.pct}%` : "—"}</TableCell>
                    <TableCell>{formatINR(r.amount)}</TableCell>
                    <TableCell><Badge variant={r.status === "paid" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.notes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="statement">
          <Card><CardHeader><CardTitle className="text-base">Consolidated Statement</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Row label="Total ROI accrued (LTD)" value={formatINR(roi.reduce((s, r) => s + Number(r.roi_due), 0))} />
              <Row label="Total ROI paid" value={formatINR(roiPaid)} />
              <Row label="ROI outstanding" value={formatINR(roiDue)} bold />
              <div className="my-2 h-px bg-border" />
              <Row label="Total Incentives accrued" value={formatINR(incTotal)} />
              <Row label="Total Incentives paid" value={formatINR(incPaid)} />
              <Row label="Incentives outstanding" value={formatINR(incTotal - incPaid)} bold />
              <div className="my-2 h-px bg-border" />
              <Row label="Net payable to State Partner" value={formatINR(roiDue + (incTotal - incPaid))} bold />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl">{value}</p></CardContent></Card>;
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex justify-between text-sm ${bold ? "font-semibold" : ""}`}><span>{label}</span><span>{value}</span></div>;
}
