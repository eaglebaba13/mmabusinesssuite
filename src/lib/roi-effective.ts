/**
 * Effective ROI terms for a given month.
 *
 * When a franchisee's investment / product is upgraded, the new terms only
 * apply from the change's effective month. Months before that keep the
 * terms recorded in `franchise_product_changes.old_values_json`.
 */
export type RoiTerms = {
  investment_amount: number;
  mg_percent: number;
  tns_percent: number;
  academy_percent: number;
  mall_percent: number;
};

export type ProductChangeRow = {
  effective_date: string | null;
  changed_at?: string | null;
  old_values_json: Partial<Record<keyof RoiTerms, number | null>> | null;
  new_values_json?: Partial<Record<keyof RoiTerms, number | null>> | null;
};

const n = (v: unknown, d = 0) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

/** First day of month as yyyy-MM-dd. */
export const monthKey = (d: string) => `${d.slice(0, 7)}-01`;

export function effectiveTermsForMonth(current: RoiTerms, changes: ProductChangeRow[], month: string): RoiTerms {
  const m = monthKey(month);
  // Changes whose effective month is after `month` were not yet in force:
  // roll back from newest to oldest, restoring each change's old values.
  const later = changes
    .filter((c) => c.effective_date && monthKey(c.effective_date) > m && c.old_values_json)
    .sort((a, b) => (a.effective_date! < b.effective_date! ? 1 : -1));
  let t: RoiTerms = { ...current };
  for (const c of later) {
    const o = c.old_values_json!;
    t = {
      investment_amount: n(o.investment_amount, t.investment_amount),
      mg_percent: n(o.mg_percent, t.mg_percent),
      tns_percent: n(o.tns_percent, t.tns_percent),
      academy_percent: n(o.academy_percent, t.academy_percent),
      mall_percent: n(o.mall_percent, t.mall_percent),
    };
  }
  return t;
}

export function computeRoi(terms: RoiTerms, totals: { tns: number; academy: number; mall: number }) {
  const a = (totals.tns * terms.tns_percent) / 100;
  const b = (totals.academy * terms.academy_percent) / 100;
  const c = (totals.mall * terms.mall_percent) / 100;
  const variable = a + b + c;
  const mg = (terms.investment_amount * terms.mg_percent) / 100;
  const final = variable >= mg ? variable : mg;
  const reason = variable >= mg ? "Variable ROI exceeded MG" : "Minimum Guarantee Applied";
  return { a, b, c, variable, mg, final, reason };
}
