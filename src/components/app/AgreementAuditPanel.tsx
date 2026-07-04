import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  franchiseeId: string;
}

const FIELD_LABELS: Record<string, string> = {
  mg_percent: "MG %",
  tns_percent: "TNS %",
  academy_percent: "Academy %",
  mall_percent: "Mall %",
  royalty_percent: "Royalty %",
  franchise_commission_amount: "Commission",
  agreement_version: "Version",
  agreement_expiry: "Expiry",
};

export function AgreementAuditPanel({ franchiseeId }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["agreement-audit", franchiseeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreement_audit_log")
        .select("*")
        .eq("franchisee_id", franchiseeId)
        .order("changed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="rounded-2xl glass p-6">
      <h3 className="font-display text-xl">Agreement history</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Every change to agreement percentages, commission, or expiry is recorded automatically.
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
          No changes recorded yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">When</th>
                <th className="px-2 py-2 text-left">Field</th>
                <th className="px-2 py-2 text-left">Old</th>
                <th className="px-2 py-2 text-left">New</th>
                <th className="px-2 py-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r: any) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {new Date(r.changed_at).toLocaleString("en-IN")}
                  </td>
                  <td className="px-2 py-2 font-medium">{FIELD_LABELS[r.field] ?? r.field}</td>
                  <td className="px-2 py-2 font-mono text-xs">{r.old_value ?? "—"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-gold">{r.new_value ?? "—"}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
