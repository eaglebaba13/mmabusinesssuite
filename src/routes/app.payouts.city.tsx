import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR } from "@/lib/format";
import { OpenDashboardButton } from "@/components/app/OpenDashboardButton";
import { useMode } from "@/lib/mode-context";
import { exportToCSV } from "@/lib/export";

export const Route = createFileRoute("/app/payouts/city")({
  head: () => ({ meta: [{ title: "City Franchise Payouts — MMA Suite" }] }),
  component: CityPayoutsPage,
});

function CityPayoutsPage() {
  const { isTesting } = useMode();
  const frQ = useQuery({
    queryKey: ["fr-list-payouts", isTesting],
    queryFn: async () =>
      (await supabase
        .from("franchisees")
        .select("id,full_name,investment_amount,base_roi_pct,emporium_pct,academy_pct,dark_store_pct,joined_at,status,territory_id,is_demo")
        .eq("is_demo", isTesting)
        .order("full_name")).data,
  });
  const [frId, setFrId] = React.useState<string>("");
  React.useEffect(() => { setFrId(frQ.data?.[0]?.id ?? ""); }, [frQ.data]);

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
  const qc = useQueryClient();
  const { isAdmin, hasRole } = useAuth();
  const canManage = isAdmin || hasRole("accounts");
  const roiQ = useQuery({
    queryKey: ["roi-payouts", fr.id],
    queryFn: async () =>
      (await supabase.from("roi_payouts").select("*").eq("franchisee_id", fr.id).order("payout_month", { ascending: false })).data,
  });
  const deletePayout = useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from("roi_payouts").delete({ count: "exact" }).eq("id", id);
      if (error) throw error;
      if (!count) throw new Error("Not permitted to delete this payout");
    },
    onSuccess: () => {
      toast.success("Payout deleted");
      qc.invalidateQueries({ queryKey: ["roi-payouts", fr.id] });
      qc.invalidateQueries({ queryKey: ["franchisee-payouts", fr.id] });
      qc.invalidateQueries({ queryKey: ["roi-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revQ = useQuery({
    queryKey: ["franchisee-rev", fr.id],
    queryFn: async () =>
      (await supabase.from("revenue_entries").select("source,amount,received_on").eq("franchisee_id", fr.id)).data,
  });
  const linkedQ = useQuery({
    queryKey: ["franchisee-linked", fr.id],
    queryFn: async () => {
      // Only Dark Store SKUs are directly attributable via the franchisee's warehouse.
      // Batches and staff are org-wide with no franchisee link → don't misrepresent them here.
      const { data: whs } = await supabase
        .from("warehouses")
        .select("id")
        .eq("franchisee_id", fr.id);
      const whIds = (whs ?? []).map((w) => w.id);
      let skus = 0;
      if (whIds.length) {
        const { data: stock } = await supabase
          .from("stock_levels")
          .select("product_id, quantity")
          .in("warehouse_id", whIds)
          .gt("quantity", 0);
        skus = new Set((stock ?? []).map((s) => s.product_id)).size;
      }
      return { skus };
    },
  });

  const payouts = roiQ.data ?? [];
  const rev = revQ.data ?? [];
  const sumBy = (src: string) => rev.filter((r) => r.source === src).reduce((s, r) => s + Number(r.amount), 0);
  const totalROI = payouts.reduce((s, p) => s + Number(p.total_amount), 0);
  const paidROI = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
  const dueROI = totalROI - paidROI;
  const hasPayouts = payouts.length > 0;

  const empRev = sumBy("emporium_sale");
  const acaRev = sumBy("academy_fee");
  const dsRev = sumBy("dark_store");

  // Rate-card projection — informational only. Do NOT surface as "variance"
  // unless real payout rows exist, otherwise an empty ledger shows as debt owed.
  const monthsActive = Math.max(1, Math.floor((Date.now() - new Date(fr.joined_at).getTime()) / (30 * 86400000)));
  const expectedBaseROI = (Number(fr.investment_amount) * Number(fr.base_roi_pct) / 100) * monthsActive;
  const expectedIncentives = empRev * Number(fr.emporium_pct) / 100 + acaRev * Number(fr.academy_pct) / 100 + dsRev * Number(fr.dark_store_pct) / 100;
  const expectedTotal = expectedBaseROI + expectedIncentives;
  const variance = hasPayouts ? expectedTotal - totalROI : 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Investment" value={formatINR(Number(fr.investment_amount))} />
        <Kpi label="Projected (rate-card)" value={formatINR(expectedTotal)} />
        <Kpi label="ROI Due" value={hasPayouts ? formatINR(dueROI) : "—"} />
        <Kpi label="ROI Paid (LTD)" value={hasPayouts ? formatINR(paidROI) : "—"} />
        <Kpi label="Variance" value={hasPayouts ? formatINR(variance) : "—"} />
      </div>
      {!hasPayouts && (
        <p className="-mt-2 text-xs text-muted-foreground">
          No payout runs yet. "Projected" is a rate-card estimate; ROI Due / Paid / Variance
          will populate once invoices are billed and the monthly payout is generated.
        </p>
      )}


      <Card>
        <CardHeader><CardTitle className="text-base">Linked Units</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
          <Stat label="Dark Store SKUs" value={`${linkedQ.data?.skus ?? 0}`} sub="in this franchisee's warehouse" />
          <Stat label="Emporium Revenue (LTD)" value={formatINR(empRev)} sub="from revenue entries" />
          <Stat label="Academy Revenue (LTD)" value={formatINR(acaRev)} sub="from revenue entries" />
          <Stat label="Months Active" value={`${monthsActive}`} sub={`since ${fr.joined_at}`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Incentive Rate Card</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
          <Stat label={`Base ROI ${fr.base_roi_pct}%`} value={formatINR(Number(fr.investment_amount) * Number(fr.base_roi_pct) / 100)} sub="/month on investment" />
          <Stat label={`Nail Emporium ${fr.emporium_pct}%`} value={formatINR(empRev * Number(fr.emporium_pct) / 100)} sub={`on ${formatINR(empRev)} sales`} />
          <Stat label={`Academy ${fr.academy_pct}%`} value={formatINR(acaRev * Number(fr.academy_pct) / 100)} sub={`on ${formatINR(acaRev)} fees`} />
          <Stat label={`Dark Store ${fr.dark_store_pct}%`} value={formatINR(dsRev * Number(fr.dark_store_pct) / 100)} sub={`on ${formatINR(dsRev)} sales`} />
        </CardContent>
      </Card>

      <Tabs defaultValue="payouts">
        <TabsList>
          <TabsTrigger value="payouts">Monthly Payouts</TabsTrigger>
          <TabsTrigger value="revenue">Linked Unit Revenue</TabsTrigger>
          <TabsTrigger value="statement">Payout Statement</TabsTrigger>
        </TabsList>
        <TabsContent value="payouts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Monthly Payouts · {payouts.length}</CardTitle>
              <button
                onClick={() => {
                  exportToCSV(`city-payouts-${fr.full_name}-${new Date().toISOString().slice(0,10)}`, payouts as any[], [
                    { header: "month", accessor: (p: any) => p.payout_month },
                    { header: "base_roi", accessor: (p: any) => p.base_roi },
                    { header: "emporium", accessor: (p: any) => p.emporium_incentive },
                    { header: "academy", accessor: (p: any) => p.academy_incentive },
                    { header: "dark_store", accessor: (p: any) => p.dark_store_incentive },
                    { header: "total", accessor: (p: any) => p.total_amount },
                    { header: "status", accessor: (p: any) => p.status },
                  ]);
                }}
                className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
              >Export CSV</button>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
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
        <TabsContent value="statement">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{fr.full_name} — Payout Statement</CardTitle>
              <button onClick={() => window.print()} className="rounded border border-border px-3 py-1 text-xs hover:bg-accent print:hidden">Print</button>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-xs text-muted-foreground">Generated {new Date().toLocaleDateString("en-IN")} · Joined {fr.joined_at} · {monthsActive} months active</p>
              <div className="my-2 h-px bg-border" />
              <div className="flex justify-between"><span>Investment</span><span>{formatINR(Number(fr.investment_amount))}</span></div>
              <div className="flex justify-between"><span>Expected accrual (LTD)</span><span>{formatINR(expectedTotal)}</span></div>
              <div className="my-2 h-px bg-border" />
              <div className="flex justify-between"><span>Total payouts accrued</span><span>{formatINR(totalROI)}</span></div>
              <div className="flex justify-between"><span>Total paid (LTD)</span><span>{formatINR(paidROI)}</span></div>
              <div className="flex justify-between font-semibold"><span>Outstanding balance</span><span>{formatINR(dueROI)}</span></div>
              <div className="my-2 h-px bg-border" />
              <div className="flex justify-between text-xs text-muted-foreground"><span>Variance vs expected</span><span>{formatINR(expectedTotal - totalROI)}</span></div>
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
function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="text-[10px] text-muted-foreground">{sub}</p></div>;
}
