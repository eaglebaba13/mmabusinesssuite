import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Package,
  Coins,
  TrendingUp,
  Percent,
  Users,
  Building2,
  Pencil,
  Download,
  Play,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatINR, formatINRCompact } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { ProductEditor } from "@/components/app/franchise/ProductEditor";
import { RoiCalculator } from "@/components/app/franchise/RoiCalculator";
import { AgreementBuilder } from "@/components/app/franchise/AgreementBuilder";
import {
  getFranchiseProduct,
  listFranchiseProductTypes,
  listRevenueModels,
} from "@/lib/rpc/franchise-products.functions";

export const Route = createFileRoute("/app/franchise-products/$productId")({
  head: () => ({ meta: [{ title: "Franchise Product — MMA Suite" }] }),
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = React.useState(false);

  const getFn = useServerFn(getFranchiseProduct);
  const listTypesFn = useServerFn(listFranchiseProductTypes);
  const listModelsFn = useServerFn(listRevenueModels);

  const productQ = useQuery({
    queryKey: ["franchise-product", productId],
    queryFn: () => getFn({ data: { id: productId } }),
  });
  const typesQ = useQuery({ queryKey: ["franchise-product-types"], queryFn: () => listTypesFn() });
  const modelsQ = useQuery({ queryKey: ["franchise-revenue-models"], queryFn: () => listModelsFn() });

  if (productQ.isLoading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="h-96 animate-pulse rounded-2xl bg-card/50" />
      </div>
    );
  }
  if (productQ.error || !productQ.data) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <Card className="p-8 text-center">
          <h2 className="font-display text-2xl">Product not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The franchise product you're looking for doesn't exist or was archived.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/franchise-products" })}>
            Back to catalog
          </Button>
        </Card>
      </div>
    );
  }

  const { product, commissions, counts } = productQ.data;
  const typeLabel =
    product.type_id ? (typesQ.data?.rows ?? []).find((t) => t.id === product.type_id)?.label : null;
  const revenueModel =
    product.revenue_model_id
      ? (modelsQ.data?.rows ?? []).find((m) => m.id === product.revenue_model_id)
      : null;

  if (editing && isAdmin) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Button variant="ghost" onClick={() => setEditing(false)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to product
        </Button>
        <ProductEditor
          initialProduct={product}
          initialCommissions={commissions}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/app/franchise-products">
          <ArrowLeft className="mr-2 h-4 w-4" /> All products
        </Link>
      </Button>

      {/* Header */}
      <Card className="mb-6 overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 ring-1 ring-border">
              {product.brand_logo_url ? (
                <img src={product.brand_logo_url} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <Package className="h-10 w-10 text-primary" />
              )}
            </div>
            <div>
              <h1 className="font-display text-3xl text-gradient-gold">{product.name}</h1>
              <p className="text-sm text-muted-foreground">
                {product.brand_name ?? product.category ?? "Franchise product"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {typeLabel && <Badge variant="outline">{typeLabel}</Badge>}
                <Badge variant={product.status === "active" ? "default" : "secondary"} className="capitalize">
                  {product.status}
                </Badge>
                {product.is_featured && (
                  <Badge className="bg-primary/20 text-primary">
                    <Trophy className="mr-1 h-3 w-3" /> Featured
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {product.brochure_url && (
              <Button variant="outline" asChild>
                <a href={product.brochure_url} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" /> Brochure
                </a>
              </Button>
            )}
            {product.video_url && (
              <Button variant="outline" asChild>
                <a href={product.video_url} target="_blank" rel="noopener noreferrer">
                  <Play className="mr-2 h-4 w-4" /> Video
                </a>
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* KPI Row */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Investment" value={formatINR(product.investment_amount)} icon={Coins} />
        <KpiTile
          label="Expected ROI"
          value={product.expected_roi_percent != null ? `${product.expected_roi_percent}%` : "—"}
          sub={product.roi_timeline_months ? `${product.roi_timeline_months} months` : undefined}
          icon={TrendingUp}
        />
        <KpiTile label="Royalty" value={`${product.royalty_percent}%`} icon={Percent} />
        <KpiTile label="Revenue Share" value={`${product.revenue_share_percent}%`} icon={Percent} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Active Leads" value={String(counts.leads)} icon={Users} />
        <KpiTile label="Franchisees" value={String(counts.franchisees)} icon={Building2} />
        <KpiTile label="MG" value={formatINRCompact(product.minimum_guarantee)} icon={Coins} />
        <KpiTile
          label="Lock-in"
          value={product.lock_in_months ? `${product.lock_in_months} months` : "—"}
          icon={Coins}
        />
      </div>

      {/* Details grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-3 font-display text-xl">About</h2>
          {product.short_description && (
            <p className="mb-3 text-sm font-medium text-foreground/90">{product.short_description}</p>
          )}
          {product.long_description ? (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{product.long_description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No description yet.</p>
          )}

          {product.highlights.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Highlights
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {product.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {product.requirements.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Requirements
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {product.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-3 font-display text-lg">Financials</h3>
            <dl className="space-y-2 text-sm">
              <Row label="Investment" value={formatINR(product.investment_amount)} />
              <Row label="GST" value={`${product.gst_percent}%`} />
              <Row label="Security deposit" value={formatINR(product.security_deposit)} />
              <Row label="Minimum guarantee" value={formatINR(product.minimum_guarantee)} />
              <Row
                label="Profit margin"
                value={product.profit_margin_percent != null ? `${product.profit_margin_percent}%` : "—"}
              />
              <Row label="Territory" value={product.territory ?? "—"} />
            </dl>
          </Card>

          {revenueModel && (
            <Card className="p-6">
              <h3 className="mb-3 font-display text-lg">Revenue Model</h3>
              <p className="mb-3 text-sm font-medium">{revenueModel.name}</p>
              <ul className="space-y-2">
                {revenueModel.franchise_revenue_model_splits
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{s.party_label}</span>
                      <span className="font-medium text-primary">{s.percent}%</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {commissions.length > 0 && (
        <Card className="mt-6 p-6">
          <h2 className="mb-4 font-display text-xl">Commission Structure</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Label</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Percent</th>
                  <th className="py-2 pr-4">Frequency</th>
                  <th className="py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id} className="border-b border-border/30 last:border-0">
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {c.kind.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 font-medium">{c.label}</td>
                    <td className="py-2 pr-4">{c.amount != null ? formatINR(c.amount) : "—"}</td>
                    <td className="py-2 pr-4">{c.percent != null ? `${c.percent}%` : "—"}</td>
                    <td className="py-2 pr-4 capitalize">{(c.frequency ?? "—").replace(/_/g, " ")}</td>
                    <td className="py-2 text-muted-foreground">{c.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary/70" />
      </div>
      <p className="mt-1 font-display text-2xl">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
