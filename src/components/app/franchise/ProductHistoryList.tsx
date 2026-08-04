import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";

export type ProductChangeRow = {
  id: string;
  old_product_id: string | null;
  new_product_id: string | null;
  old_values_json: Record<string, unknown>;
  new_values_json: Record<string, unknown>;
  mode: string;
  reason: string | null;
  remarks: string | null;
  effective_date: string;
  changed_at: string;
};

export function useProductChangeHistory(franchiseeId: string) {
  return useQuery({
    queryKey: ["franchise-product-changes", franchiseeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_product_changes")
        .select("*")
        .eq("franchisee_id", franchiseeId)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductChangeRow[];
    },
  });
}

export function ProductHistoryList({
  franchiseeId,
  productNames,
}: {
  franchiseeId: string;
  productNames: Record<string, string>;
}) {
  const { data: rows = [], isLoading } = useProductChangeHistory(franchiseeId);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading history…</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-background/40 p-6 text-center">
        <History className="mx-auto h-6 w-6 text-muted-foreground/50" />
        <p className="mt-2 text-xs text-muted-foreground">No product changes recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const oldName = r.old_product_id ? (productNames[r.old_product_id] ?? "Previous product") : "None";
        const newName = r.new_product_id ? (productNames[r.new_product_id] ?? "New product") : "None";
        const oldInv = Number(r.old_values_json?.["investment_amount"] ?? 0);
        const newInv = Number(r.new_values_json?.["investment_amount"] ?? 0);
        return (
          <div key={r.id} className="rounded-xl border border-border/50 bg-background/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {format(new Date(r.changed_at), "dd MMM yyyy, HH:mm")} · effective{" "}
                {format(new Date(r.effective_date), "dd MMM yyyy")}
              </div>
              <div className="flex items-center gap-1.5">
                {r.reason && (
                  <Badge variant="outline" className="border-gold/40 text-gold">
                    {r.reason}
                  </Badge>
                )}
                <Badge variant="outline" className="capitalize">
                  {r.mode === "keep_existing" ? "Kept values" : "Product defaults"}
                </Badge>
              </div>
            </div>
            <div className="mt-2 text-sm">
              <span className="text-muted-foreground">{oldName}</span>
              <span className="mx-2 text-gold">→</span>
              <span className="font-medium">{newName}</span>
            </div>
            {r.mode !== "keep_existing" && (oldInv > 0 || newInv > 0) && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Investment {formatINR(oldInv)} → {formatINR(newInv)}
              </div>
            )}
            {r.remarks && <p className="mt-2 text-[11px] text-muted-foreground">{r.remarks}</p>}
          </div>
        );
      })}
    </div>
  );
}
