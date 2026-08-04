/**
 * Maps a master Franchise Product template onto the commercial fields
 * stored on a franchisee record.
 *
 * Historical data (invoices, ROI payouts, commissions, agreements) is never
 * touched — only the forward-looking configuration on the franchisee row.
 */

export type ProductTemplate = {
  id: string;
  name: string;
  brand_name: string | null;
  brand_logo: string | null;
  category: string | null;
  investment_amount: number;
  royalty_percent: number;
  revenue_share_percent: number;
  minimum_guarantee: number;
  expected_roi_percent: number | null;
  lock_in_months: number;
  agreement_template: string | null;
  status: string;
};

export type ProductCommission = {
  kind: string;
  label: string;
  amount: number | null;
  percent: number | null;
};

/** Commercial fields on the franchisee that a product change can update. */
export type FranchiseeCommercials = {
  investment_amount: number;
  franchise_fee: number;
  mg_percent: number;
  tns_percent: number;
  academy_percent: number;
  mall_percent: number;
  royalty_percent: number;
  franchise_commission_amount: number;
  agreement_version: string | null;
};

export const CHANGE_REASONS = [
  "Upgrade",
  "Downgrade",
  "Correction",
  "Migration",
  "Manual Override",
] as const;

export type ChangeReason = (typeof CHANGE_REASONS)[number];

const pctFor = (commissions: ProductCommission[], needle: string) => {
  const hit = commissions.find((c) => `${c.label} ${c.kind}`.toLowerCase().includes(needle));
  return hit?.percent == null ? null : Number(hit.percent);
};

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Derives the franchisee commercial values implied by a product template.
 * Anything the template does not define falls back to the current value so a
 * change never silently zeroes out a negotiated number.
 */
export function productDefaults(
  product: ProductTemplate,
  commissions: ProductCommission[],
  current: FranchiseeCommercials,
): FranchiseeCommercials {
  const oneTime = commissions
    .filter((c) => c.kind === "one_time" || c.kind === "bonus" || c.kind === "referral_bonus")
    .reduce((sum, c) => sum + num(c.amount), 0);

  const mgPct = num(product.minimum_guarantee);

  return {
    investment_amount: num(product.investment_amount, current.investment_amount),
    franchise_fee: num(product.investment_amount, current.franchise_fee),
    // minimum_guarantee is stored as a percentage on the product template
    mg_percent: mgPct > 0 && mgPct <= 100 ? mgPct : current.mg_percent,
    tns_percent: pctFor(commissions, "tns") ?? num(product.revenue_share_percent, current.tns_percent),
    academy_percent: pctFor(commissions, "academy") ?? 0,
    mall_percent: pctFor(commissions, "mall") ?? 0,
    royalty_percent: num(product.royalty_percent, current.royalty_percent),
    franchise_commission_amount: oneTime,
    agreement_version: product.agreement_template ?? current.agreement_version ?? null,
  };
}

export type DiffRow = {
  key: keyof FranchiseeCommercials;
  label: string;
  kind: "currency" | "percent" | "text";
  from: number | string | null;
  to: number | string | null;
  changed: boolean;
};

const FIELD_META: Array<{ key: keyof FranchiseeCommercials; label: string; kind: DiffRow["kind"] }> = [
  { key: "investment_amount", label: "Investment", kind: "currency" },
  { key: "franchise_fee", label: "Franchise fee", kind: "currency" },
  { key: "mg_percent", label: "MG %", kind: "percent" },
  { key: "royalty_percent", label: "Royalty %", kind: "percent" },
  { key: "tns_percent", label: "TNS %", kind: "percent" },
  { key: "academy_percent", label: "Academy %", kind: "percent" },
  { key: "mall_percent", label: "Mall of Salon %", kind: "percent" },
  { key: "franchise_commission_amount", label: "Commission", kind: "currency" },
  { key: "agreement_version", label: "Agreement template", kind: "text" },
];

export function buildDiff(from: FranchiseeCommercials, to: FranchiseeCommercials): DiffRow[] {
  return FIELD_META.map((m) => ({
    key: m.key,
    label: m.label,
    kind: m.kind,
    from: from[m.key] ?? null,
    to: to[m.key] ?? null,
    changed: String(from[m.key] ?? "") !== String(to[m.key] ?? ""),
  }));
}
