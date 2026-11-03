import { describe, it, expect } from "vitest";
import { effectiveTermsForMonth, computeRoi } from "./roi-effective";

const current = { investment_amount: 5000000, mg_percent: 3, tns_percent: 15, academy_percent: 0, mall_percent: 0 };
const changes = [
  {
    effective_date: "2026-11-01",
    old_values_json: { investment_amount: 500000, mg_percent: 3, tns_percent: 10, academy_percent: 3, mall_percent: 3 },
  },
];

describe("investment upgrade effective month", () => {
  it("October keeps the old ₹5L investment (MG ₹15,000)", () => {
    const t = effectiveTermsForMonth(current, changes, "2026-10-01");
    expect(t.investment_amount).toBe(500000);
    expect(computeRoi(t, { tns: 0, academy: 0, mall: 0 }).mg).toBe(15000);
  });
  it("November uses the new ₹50L investment (MG ₹1,50,000)", () => {
    const t = effectiveTermsForMonth(current, changes, "2026-11-01");
    expect(computeRoi(t, { tns: 0, academy: 0, mall: 0 }).mg).toBe(150000);
  });
});
