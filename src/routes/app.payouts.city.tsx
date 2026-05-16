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
import { useMode } from "@/lib/mode-context";

export const Route = createFileRoute("/app/payouts/city")({
  head: () => ({ meta: [{ title: "City Franchise Payouts — MMA Suite" }] }),
  component: CityPayoutsPage,
});

function CityPayoutsPage() {
  const frQ = useQuery({
    queryKey: ["fr-list-payouts"],
    queryFn: async () =>
      (await supabase
        .from("franchisees")
        .select("id,full_name,investment_amount,base_roi_pct,emporium_pct,academy_pct,dark_store_pct,joined_at,status,territory_id")
        .order("full_name")).data,
  });
  const [frId, setFrId] = React.useState<string>("");
  React.useEffect(() => { if (!frId && frQ.data?.[0]) setFrId(frQ.data[0].id); }, [frQ.data, frId]);

  const selected = frQ.data?.find((f) => f.id === frId);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">Finance</p>
          <h1 className="font-display text-3xl">City Franchise Payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">3% Base ROI + 10% Nail Emporium + 3% Academy + 3% Dark Store incentive ledger per city.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={frId} onValueChange={setFrId}>
            <SelectTrigger className="w-80"><SelectValue placeholder="Pick franchisee" /></SelectTrigger>
            <SelectContent>
              {frQ.data?.map((f) => <SelectItem key={f.id} value={f.id}>{f.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {frId && <OpenDashboardButton entity_type="city_franchise" entity_id={frId} label="Open" />}
        </div>
      </div>
      {selected && <CityContent fr={selected} />}
    </div>
  );
}

function CityContent({ fr }: { fr: any }) {
  const roiQ = useQuery({
    queryKey: ["roi-payouts", fr.id],
    queryFn: async () =>
      (await supabase.from("roi_payouts").select("*").eq("franchisee_id", fr.id).order("payout_month", { ascending: false })).data,
  });
  const revQ = useQuery({
    queryKey: ["franchisee-rev", fr.id],
    queryFn: async () =>
      (await supabase.from("revenue_entries").select("source,amount,received_on").eq("franchisee_id", fr.id)).data,
  });

  const payouts = roiQ.data ?? [];
  const rev = revQ.data ?? [];
  const sumBy = (src: string) => rev.filter((r) => r.source === src).reduce((s, r) => s + Number(r.amount), 0);
  const totalROI = payouts.reduce((s, p) => s + Number(p.total_amount), 0);
  const paidROI = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
  const dueROI = totalROI - paidROI;

  const empRev = sumBy("emporium_sale");
  const acaRev = sumBy("academy_fee");
  const dsRev = sumBy("dark_store");

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Investment" value={formatINR(Number(fr.investment_amount))} />
        <Kpi label="ROI Due" value={formatINR(dueROI)} />
        <Kpi label="ROI Paid (LTD)" value={formatINR(paidROI)} />
        <Kpi label="Total Payouts" value={`${payouts.length}`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Incentive Rate Card</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
          <Stat label={`Base ROI ${fr.base_roi_pct}%`} value={formatINR(Number(fr.investment_amount) * Number(fr.base_roi_pct) / 100 / 12)} sub="/month on investment" />
          <Stat label={`Nail Emporium ${fr.emporium_pct}%`} value={formatINR(empRev * Number(fr.emporium_pct) / 100)} sub={`on ${formatINR(empRev)} sales`} />
          <Stat label={`Academy ${fr.academy_pct}%`} value={formatINR(acaRev * Number(fr.academy_pct) / 100)} sub={`on ${formatINR(acaRev)} fees`} />
          <Stat label={`Dark Store ${fr.dark_store_pct}%`} value={formatINR(dsRev * Number(fr.dark_store_pct) / 100)} sub={`on ${formatINR(dsRev)} sales`} />
        </CardContent>
      </Card>

      <Tabs defaultValue="payouts">
        <TabsList>
          <TabsTrigger value="payouts">Monthly Payouts</TabsTrigger>
          <TabsTrigger value="revenue">Linked Unit Revenue</TabsTrigger>
        </TabsList>
        <TabsContent value="payouts">
          <Card><CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Base ROI</TableHead><TableHead>Emporium</TableHead><TableHead>Academy</TableHead><TableHead>Dark Store</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{new Date(p.payout_month).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</TableCell>
                    <TableCell>{formatINR(p.base_roi)}</TableCell>
                    <TableCell>{formatINR(p.emporium_incentive)}</TableCell>
                    <TableCell>{formatINR(p.academy_incentive)}</TableCell>
                    <TableCell>{formatINR(p.dark_store_incentive)}</TableCell>
                    <TableCell className="font-semibold">{formatINR(p.total_amount)}</TableCell>
                    <TableCell><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {payouts.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No payouts yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="revenue">
          <Card><CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Entries</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {Object.entries(rev.reduce<Record<string, { c: number; sum: number }>>((acc, r) => {
                  const k = r.source ?? "other";
                  acc[k] = acc[k] ?? { c: 0, sum: 0 };
                  acc[k].c++; acc[k].sum += Number(r.amount);
                  return acc;
                }, {})).map(([k, v]) => (
                  <TableRow key={k}><TableCell className="capitalize">{k.replace("_", " ")}</TableCell><TableCell>{v.c}</TableCell><TableCell className="text-right font-mono">{formatINR(v.sum)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl">{value}</p></CardContent></Card>;
}
function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="text-[10px] text-muted-foreground">{sub}</p></div>;
}
