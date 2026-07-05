import * as React from "react";
import { BrandLogo } from "@/components/app/franchise/BrandLogo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ArrowLeft, GitCompareArrows, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import {
  listFranchiseProducts,
  listFranchiseProductTypes,
} from "@/lib/rpc/franchise-products.functions";

const searchSchema = z.object({
  ids: z.string().optional(),
});

export const Route = createFileRoute("/app/franchise-compare")({
  head: () => ({ meta: [{ title: "Compare Franchise Products — MMA Suite" }] }),
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  component: ComparePage,
});

function ComparePage() {
  const { ids } = Route.useSearch();
  const idList = React.useMemo(
    () => (ids ? ids.split(",").filter(Boolean).slice(0, 4) : []),
    [ids],
  );

  const listFn = useServerFn(listFranchiseProducts);
  const listTypesFn = useServerFn(listFranchiseProductTypes);
  const productsQ = useQuery({ queryKey: ["franchise-products"], queryFn: () => listFn() });
  const typesQ = useQuery({ queryKey: ["franchise-product-types"], queryFn: () => listTypesFn() });

  const products = React.useMemo(
    () => (productsQ.data?.rows ?? []).filter((p) => idList.includes(p.id)),
    [productsQ.data, idList],
  );

  const typeLabelById = React.useMemo(() => {
    const m = new Map<string, string>();
    (typesQ.data?.rows ?? []).forEach((t) => m.set(t.id, t.label));
    return m;
  }, [typesQ.data]);

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/app/franchise-marketplace">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Marketplace
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="flex items-center gap-3 font-display text-3xl text-gradient-gold">
          <GitCompareArrows className="h-8 w-8 text-primary" /> Compare Products
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Side-by-side view of investment, ROI, royalty, and terms.
        </p>
      </div>

      {products.length < 2 ? (
        <Card className="border-dashed p-16 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 font-display text-xl">Select at least 2 products to compare</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Head to the Marketplace and tick the "Compare" checkbox on 2–4 products.
          </p>
          <Button className="mt-4" asChild>
            <Link to="/app/franchise-marketplace">Open Marketplace</Link>
          </Button>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background/80 py-3 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                  Feature
                </th>
                {products.map((p) => (
                  <th key={p.id} className="min-w-[220px] py-3 text-left align-top">
                    <Link
                      to="/app/franchise-products/$productId"
                      params={{ productId: p.id }}
                      className="group block rounded-lg p-2 transition-colors hover:bg-primary/5"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 to-accent/10 ring-1 ring-border">
                          {p.brand_logo ? (
                            <BrandLogo path={p.brand_logo} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-display text-base leading-tight text-foreground group-hover:text-primary">
                            {p.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {p.brand_name ?? p.category ?? "—"}
                          </div>
                          {p.type_id && typeLabelById.get(p.type_id) && (
                            <Badge variant="outline" className="mt-1 text-[10px]">
                              {typeLabelById.get(p.type_id)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr]:border-b [&>tr]:border-border/40">
              <CompareRow label="Investment" values={products.map((p) => formatINR(p.investment_amount))} highlight />
              <CompareRow label="GST" values={products.map((p) => `${p.gst_percent}%`)} />
              <CompareRow label="Security Deposit" values={products.map((p) => formatINR(p.security_deposit))} />
              <CompareRow
                label="Expected ROI"
                values={products.map((p) =>
                  p.expected_roi_percent != null ? `${p.expected_roi_percent}%` : "—",
                )}
                highlight
              />
              <CompareRow
                label="ROI Timeline"
                values={products.map((p) => (p.roi_timeline_months ? `${p.roi_timeline_months} months` : "—"))}
              />
              <CompareRow label="Royalty" values={products.map((p) => `${p.royalty_percent}%`)} highlight />
              <CompareRow
                label="Revenue Share"
                values={products.map((p) => `${p.revenue_share_percent}%`)}
              />
              <CompareRow
                label="Minimum Guarantee"
                values={products.map((p) => formatINR(p.minimum_guarantee))}
              />
              <CompareRow
                label="Profit Margin"
                values={products.map((p) =>
                  p.profit_margin_percent != null ? `${p.profit_margin_percent}%` : "—",
                )}
              />
              <CompareRow
                label="Lock-in"
                values={products.map((p) => (p.lock_in_months ? `${p.lock_in_months} months` : "—"))}
              />
              
              <CompareRow
                label="Highlights"
                values={products.map((p) =>
                  p.highlights.length ? p.highlights.slice(0, 4).join(" • ") : "—",
                )}
              />
              <CompareRow
                label="Requirements"
                values={products.map((p) =>
                  p.requirements.length ? p.requirements.slice(0, 4).join(" • ") : "—",
                )}
              />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CompareRow({
  label,
  values,
  highlight = false,
}: {
  label: string;
  values: string[];
  highlight?: boolean;
}) {
  return (
    <tr>
      <td className="sticky left-0 z-10 bg-background/80 py-3 pr-4 align-top text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`py-3 pr-4 align-top ${highlight ? "font-medium text-primary" : "text-foreground"}`}
        >
          {v}
        </td>
      ))}
    </tr>
  );
}
