import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth } from "date-fns";

interface Props {
  franchiseeId: string;
}

/**
 * Monthly ROI panel — displays the engine-computed breakdown for the current month:
 * Fixed MG, A/B/C incentives, Variable ROI, Final Payable + reason.
 */
export function MonthlyRoiPanel({ franchiseeId }: Props) {
  const monthStart = startOfMonth(new Date());
  const monthKey = format(monthStart, "yyyy-MM-dd");
  const monthLabel = monthStart.toLocaleString("en-IN", { month: "long", year: "numeric" });

  const { data, isLoading } = useQuery({
    queryKey: ["monthly-roi", franchiseeId, monthKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_franchisee_monthly_roi", {
        _franchisee_id: franchiseeId,
        _month: monthKey,
      });
      if (error) throw error;
      return (data ?? [])[0] as
        | {
            tns_total: number;
            academy_total: number;
            mall_total: number;
            a: number;
            b: number;
            c: number;
            variable_roi: number;
            mg: number;
            final_payable: number;
            reason: string;
          }
        | undefined;
    },
  });

  if (isLoading) {
    return <div className="rounded-2xl glass p-6 text-sm text-muted-foreground">Computing monthly ROI…</div>;
  }
  if (!data) {
    return <div className="rounded-2xl glass p-6 text-sm text-muted-foreground">No ROI data yet.</div>;
  }

  const mgApplied = data.reason === "Minimum Guarantee Applied";

  return (
    <div className="rounded-2xl glass p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Monthly ROI</p>
          <h3 className="font-display text-xl">{monthLabel}</h3>
        </div>
        <Badge
          variant="outline"
          className={mgApplied ? "border-amber-500/40 text-amber-400" : "border-emerald-500/40 text-emerald-400"}
        >
          {data.reason}
        </Badge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Row label="Fixed MG" value={formatINR(Number(data.mg))} muted={!mgApplied} />
        <Row label="Variable ROI" value={formatINR(Number(data.variable_roi))} muted={mgApplied} />
        <Row label="Final Payable" value={formatINR(Number(data.final_payable))} highlight />
      </div>

      <div className="mt-5 grid gap-2 rounded-xl bg-background/40 p-4 text-sm sm:grid-cols-3">
        <IncRow label="A · TNS Incentive" total={data.tns_total} value={data.a} />
        <IncRow label="B · Academy Incentive" total={data.academy_total} value={data.b} />
        <IncRow label="C · Mall Incentive" total={data.mall_total} value={data.c} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Formula: <span className="font-mono">Final Payable = MAX(MG, A + B + C)</span>. Recomputes automatically on any invoice change.
      </p>
    </div>
  );
}

function Row({ label, value, muted, highlight }: { label: string; value: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className={`rounded-xl bg-background/40 p-4 ${highlight ? "border border-gold/40" : ""} ${muted ? "opacity-60" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl ${highlight ? "text-gradient-gold" : ""}`}>{value}</div>
    </div>
  );
}

function IncRow({ label, total, value }: { label: string; total: number; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono">{formatINR(Number(value))}</div>
      <div className="text-[10px] text-muted-foreground">on {formatINR(Number(total))}</div>
    </div>
  );
}
