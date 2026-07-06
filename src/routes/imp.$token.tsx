import * as React from "react";
import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveImpersonation, fetchImpersonationData, endImpersonation } from "@/lib/rpc/impersonation.functions";
import { formatINR } from "@/lib/format";
import { Eye, LogOut, Lock, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/imp/$token")({
  head: () => ({ meta: [{ title: "Impersonation — MMA Suite" }] }),
  component: ImpersonationPage,
});

function ImpersonationPage() {
  const { token } = useParams({ from: "/imp/$token" });
  const navigate = useNavigate();
  const resolve = useServerFn(resolveImpersonation);
  const fetchData = useServerFn(fetchImpersonationData);
  const endFn = useServerFn(endImpersonation);

  const ctxQ = useQuery({ queryKey: ["imp-ctx", token], queryFn: () => resolve({ data: { token } }) });
  const dataQ = useQuery({
    queryKey: ["imp-data", token],
    queryFn: () => fetchData({ data: { token } }),
    enabled: !!ctxQ.data,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 20000,
    staleTime: 0,
  });

  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (ctxQ.isLoading) return <div className="p-10">Loading impersonation…</div>;
  if (ctxQ.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Impersonation invalid</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{(ctxQ.error as Error).message}</p>
            <Button className="mt-4" onClick={() => navigate({ to: "/app/dashboard" })}>Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ctx = ctxQ.data!;
  const remainMs = Math.max(0, new Date(ctx.expires_at).getTime() - now);
  const mm = Math.floor(remainMs / 60000).toString().padStart(2, "0");
  const ss = Math.floor((remainMs % 60000) / 1000).toString().padStart(2, "0");

  const handleExit = async () => {
    try { await endFn({ data: { token } }); } catch {}
    window.close();
    navigate({ to: "/app/dashboard" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Banner */}
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" /> Impersonating</Badge>
          <span className="font-semibold">{ctx.name}</span>
          <span className="text-xs text-muted-foreground">({ctx.entity_type.replace("_", " ")})</span>
          <span className="text-xs text-muted-foreground">
            by {ctx.acting_admin?.full_name ?? ctx.acting_admin?.email ?? "Admin"}
          </span>
          <Badge variant="outline" className="gap-1 text-xs"><Lock className="h-3 w-3" />{ctx.mode}</Badge>
          <span className="font-mono text-xs">expires in {mm}:{ss}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => dataQ.refetch()}
            disabled={dataQ.isFetching}
            title="Refresh data"
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${dataQ.isFetching ? "animate-spin" : ""}`} />
            {dataQ.isFetching ? "Refreshing" : "Refresh"}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleExit}><LogOut className="mr-1 h-3.5 w-3.5" /> Exit</Button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Entity Dashboard (read-only)</p>
          <h1 className="font-display text-3xl">{ctx.name}</h1>
        </div>

        {dataQ.isLoading && <p className="text-sm text-muted-foreground">Loading data…</p>}

        {ctx.entity_type === "state_franchise" && dataQ.data && (
          <StateFranchiseView data={dataQ.data as any} />
        )}
        {(ctx.entity_type === "city_franchise" || ctx.entity_type === "academy" || ctx.entity_type === "dark_store") && dataQ.data && (
          <CityLikeView data={dataQ.data as any} extra={ctx.extra as any} entityType={ctx.entity_type} />
        )}
        {ctx.entity_type === "salon_branch" && dataQ.data && (
          <SalonBranchView data={dataQ.data as any} />
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}

function StateFranchiseView({ data }: { data: { roi: any[]; incentives: any[]; targets: any[]; cities: any[] } }) {
  const roiDue = data.roi.filter((r) => r.status !== "paid").reduce((s, r) => s + Number(r.roi_due) - Number(r.paid_amount), 0);
  const roiPaid = data.roi.reduce((s, r) => s + Number(r.paid_amount), 0);
  const incTotal = data.incentives.reduce((s, r) => s + Number(r.amount), 0);
  const target = data.targets[0];
  const cityCount = data.cities.flatMap((t) => t.franchisees ?? []).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="ROI Due" value={formatINR(roiDue)} />
        <Kpi label="ROI Paid (LTD)" value={formatINR(roiPaid)} />
        <Kpi label="Incentives (LTD)" value={formatINR(incTotal)} />
        <Kpi label="Active Cities" value={`${cityCount} / ${target?.target_count ?? 10}`} />
      </div>

      {target && (
        <Card>
          <CardHeader><CardTitle className="text-base">Activation Target — Year {target.contract_year}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-2 rounded-full bg-gradient-gold" style={{ width: `${Math.min(100, (target.activated_count / target.target_count) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {target.activated_count} of {target.target_count} activations · {formatINR(Number(target.per_activation_amount))} per activation
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">ROI Ledger (last 24 months)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Basis</TableHead><TableHead>%</TableHead><TableHead>Due</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.roi.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.period_month).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</TableCell>
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

      <Card>
        <CardHeader><CardTitle className="text-base">Incentive Ledger</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Kind</TableHead><TableHead>Basis</TableHead><TableHead>%</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.incentives.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.period_month).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</TableCell>
                  <TableCell className="capitalize">{r.kind.replace("_", " ")}</TableCell>
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

      <Card>
        <CardHeader><CardTitle className="text-base">City Franchises in this State</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Territory</TableHead><TableHead>Franchisee</TableHead><TableHead>Joined</TableHead><TableHead>Investment</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.cities.flatMap((t) => (t.franchisees ?? []).map((f: any) => (
                <TableRow key={f.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{f.full_name}</TableCell>
                  <TableCell>{f.joined_at}</TableCell>
                  <TableCell>{formatINR(f.investment_amount)}</TableCell>
                  <TableCell><Badge variant="outline">{f.status}</Badge></TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CityLikeView({ data, extra, entityType }: { data: { invoices: any[]; excluded_invoices?: any[]; payments: any[] }; extra: any; entityType: string }) {
  const totalBilled = data.invoices.reduce((s, i) => s + Number(i.grand_total), 0);
  const totalGst = data.invoices.reduce((s, i) => s + Number(i.gst_total ?? 0), 0);
  const taxableRevenue = totalBilled - totalGst;
  const totalPaid = data.invoices.reduce((s, i) => s + Number(i.amount_paid), 0);
  const outstanding = totalBilled - totalPaid;
  const excluded = data.excluded_invoices ?? [];
  const investment = Number(extra?.investment_amount ?? 0);
  const mgPct = Number(extra?.mg_percent ?? 0);
  const tnsPct = Number(extra?.tns_percent ?? 0);
  const academyPct = Number(extra?.academy_percent ?? 0);
  const mallPct = Number(extra?.mall_percent ?? 0);
  const royaltyPct = Number(extra?.royalty_percent ?? 0);

  // Category-wise turnover from mapped invoices (matches compute_franchisee_monthly_roi)
  const sumBy = (cat: string) => data.invoices
    .filter((i) => i.invoice_category === cat)
    .reduce((s, i) => s + Number(i.grand_total), 0);
  const tnsTotal = sumBy("tns_turnover");
  const academyTotal = sumBy("academy_sales");
  const mallTotal = sumBy("mall_of_salon_sales");

  const tnsRoi = tnsTotal * tnsPct / 100;
  const academyRoi = academyTotal * academyPct / 100;
  const mallRoi = mallTotal * mallPct / 100;
  const variableRoi = tnsRoi + academyRoi + mallRoi;
  const mgRoi = investment * mgPct / 100;
  const finalPayable = Math.max(variableRoi, mgRoi);
  const payableReason = variableRoi >= mgRoi ? "Variable ROI exceeded MG" : "Minimum Guarantee Applied";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total Billed" value={formatINR(totalBilled)} />
        <Kpi label="Paid" value={formatINR(totalPaid)} />
        <Kpi label="Outstanding" value={formatINR(outstanding)} />
        <Kpi label="Investment" value={formatINR(investment)} />
      </div>
      {entityType === "city_franchise" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Taxable Revenue (ex-GST)" value={formatINR(taxableRevenue)} />
            <Kpi label="GST Collected" value={formatINR(totalGst)} />
            <Kpi label={`MG @ ${mgPct}%`} value={formatINR(mgRoi)} />
            <Kpi label="Variable ROI" value={formatINR(variableRoi)} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label={`Sale from TNS @ ${tnsPct}% incentive`} value={formatINR(tnsRoi)} />
            <Kpi label={`Sale from Academy @ ${academyPct}% incentive`} value={formatINR(academyRoi)} />
            <Kpi label={`Sale from Mall of Salon @ ${mallPct}% incentive`} value={formatINR(mallRoi)} />
            <Kpi label="Final Payable ROI" value={formatINR(finalPayable)} />
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Revenue rule: final outward tax invoices only (b2b_tax / b2c / debit_note, status issued/paid/partial, non-intercompany). Proformas, drafts, revised and intercompany flows are excluded. ROI is computed per invoice_category (TNS / Academy / Mall of Salon) using the agreement's negotiated percentages, and compared against the Minimum Guarantee — whichever is higher becomes payable. Reason: <strong>{payableReason}</strong>.
      </p>
      {entityType === "city_franchise" && (
        <Card>
          <CardHeader><CardTitle className="text-base">ROI Configuration (from agreement)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <div>MG: <strong>{mgPct}%</strong></div>
            <div>TNS Turnover: <strong>{tnsPct}%</strong></div>
            <div>Academy: <strong>{academyPct}%</strong></div>
            <div>Mall of Salon: <strong>{mallPct}%</strong></div>
            <div>Royalty: <strong>{royaltyPct}%</strong></div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Invoices counted as revenue ({data.invoices.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.invoice_number ?? "DRAFT"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{i.doc_type}</Badge></TableCell>
                  <TableCell>{i.invoice_date}</TableCell>
                  <TableCell>{formatINR(i.grand_total)}</TableCell>
                  <TableCell>{formatINR(i.amount_paid)}</TableCell>
                  <TableCell><Badge variant={i.payment_status === "paid" ? "default" : "secondary"}>{i.payment_status}</Badge></TableCell>
                </TableRow>
              ))}
              {data.invoices.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No revenue-bearing invoices</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {excluded.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Excluded from revenue ({excluded.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Total</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
              <TableBody>
                {excluded.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.invoice_number ?? "DRAFT"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{i.doc_type}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{i.status}</Badge></TableCell>
                    <TableCell>{formatINR(i.grand_total)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.exclusion_reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SalonBranchView({ data }: { data: { branch: any } }) {
  const b = data.branch;
  if (!b) return <p>Branch not found</p>;
  const services = (b.service_catalog ?? []) as Array<{ name: string; price: number }>;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">{b.name}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Brand: <strong className="capitalize">{b.parent_brand?.replace("_", " ")}</strong></div>
          <div>Location: {b.city}, {b.state}</div>
          <div>Status: <Badge variant="outline">{b.status}</Badge></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Service Catalog</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Service</TableHead><TableHead>Price</TableHead></TableRow></TableHeader>
            <TableBody>
              {services.map((s, i) => <TableRow key={i}><TableCell>{s.name}</TableCell><TableCell>{formatINR(s.price)}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
