import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { productDefaults, type ProductCommission, type ProductTemplate } from "@/lib/franchise-product-map";

/** Territory allotment editor (franchise edit profile). */
export function TerritoryFields({ form, setForm }: { form: any; setForm: (f: any) => void }) {
  const { data: territories = [] } = useQuery({
    queryKey: ["territories-list"],
    queryFn: async () => (await supabase.from("territories").select("id, name, state").order("name")).data ?? [],
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const txt = (k: string, label: string, ph?: string) => (
    <div>
      <Label>{label}</Label>
      <Input value={form[k] ?? ""} onChange={set(k)} placeholder={ph} className="mt-1" />
    </div>
  );
  return (
    <>
      <div>
        <Label>Allotted territory (state network)</Label>
        <Select value={form.territory_id ?? "__none__"} onValueChange={(v) => setForm({ ...form, territory_id: v === "__none__" ? null : v })}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="No territory" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No territory</SelectItem>
            {territories.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.name}{t.state ? ` (${t.state})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {txt("territory_country", "Country", "India")}
        {txt("territory_state", "State")}
        {txt("territory_district", "District")}
        {txt("territory_city", "City")}
        {txt("territory_area", "Area", "e.g. Vaishali Nagar")}
        {txt("territory_pincode", "Pincode")}
        <div>
          <Label>Radius (km)</Label>
          <Input type="number" step="0.1" value={form.territory_radius_km ?? ""} onChange={set("territory_radius_km")} className="mt-1" />
        </div>
        <div />
        <div>
          <Label>Start date</Label>
          <Input type="date" value={form.territory_start_date ?? ""} onChange={set("territory_start_date")} className="mt-1" />
        </div>
        <div>
          <Label>End date</Label>
          <Input type="date" value={form.territory_end_date ?? ""} onChange={set("territory_end_date")} className="mt-1" />
        </div>
      </div>
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.territory_exclusive} onChange={(e) => setForm({ ...form, territory_exclusive: e.target.checked })} />
          Exclusive territory
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.territory_approved} onChange={(e) => setForm({ ...form, territory_approved: e.target.checked })} />
          Approved
        </label>
      </div>
    </>
  );
}

/** Shows the assigned Franchise Product's ROI % and lets admin reapply them to the agreement. */
export function ProductPctSync({
  franchiseProductId,
  current,
  onApply,
}: {
  franchiseProductId: string | null;
  current: any;
  onApply: (v: Record<string, number>) => void;
}) {
  const { data } = useQuery({
    queryKey: ["product-pct-sync", franchiseProductId],
    enabled: !!franchiseProductId,
    queryFn: async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        (supabase as any).from("franchise_products").select("*").eq("id", franchiseProductId).maybeSingle(),
        (supabase as any).from("franchise_product_commissions").select("kind,label,amount,percent").eq("product_id", franchiseProductId),
      ]);
      return { product: p as ProductTemplate | null, commissions: (c ?? []) as ProductCommission[] };
    },
  });
  if (!franchiseProductId) {
    return <p className="rounded-lg border border-border/50 p-3 text-xs text-muted-foreground">No Franchise Product assigned — assign one in the Product tab so ROI % follow the product.</p>;
  }
  if (!data?.product) return null;
  const d = productDefaults(data.product, data.commissions, {
    investment_amount: Number(current.investment_amount ?? 0),
    franchise_fee: Number(current.franchise_fee ?? 0),
    mg_percent: Number(current.mg_percent ?? 0),
    tns_percent: Number(current.tns_percent ?? 0),
    academy_percent: Number(current.academy_percent ?? 0),
    mall_percent: Number(current.mall_percent ?? 0),
    royalty_percent: Number(current.royalty_percent ?? 0),
    franchise_commission_amount: Number(current.franchise_commission_amount ?? 0),
    agreement_version: current.agreement_version ?? null,
  });
  const keys = ["mg_percent", "tns_percent", "academy_percent", "mall_percent", "royalty_percent"] as const;
  const differs = keys.some((k) => Number(current[k] ?? 0) !== Number(d[k]));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/30 bg-gold/5 p-3 text-xs">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-gold" />
        <span>
          Product <b>{data.product.name}</b>: MG {d.mg_percent}% · TNS {d.tns_percent}% · Academy {d.academy_percent}% · Mall {d.mall_percent}% · Royalty {d.royalty_percent}%
        </span>
      </div>
      {differs ? (
        <Button size="sm" variant="outline" onClick={() => onApply(Object.fromEntries(keys.map((k) => [k, Number(d[k])])))}>
          Use product %
        </Button>
      ) : (
        <span className="text-emerald-400">Matches product</span>
      )}
    </div>
  );
}
