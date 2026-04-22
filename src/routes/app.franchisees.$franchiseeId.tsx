import * as React from "react";
import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINRCompact } from "@/lib/format";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/franchisees/$franchiseeId")({
  head: () => ({ meta: [{ title: "Franchisee — MMA Suite" }] }),
  component: FranchiseeDetailPage,
  errorComponent: ({ error, reset }) => {
    if (import.meta.env.DEV) console.error(error);
    return (
      <div className="p-12 text-center">
        <p className="text-destructive">Something went wrong. Please try again.</p>
        <Button onClick={reset} className="mt-4">Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="p-12 text-center">
      <p>Franchisee not found.</p>
      <Link to="/app/franchisees" className="mt-4 inline-block text-gold underline">Back</Link>
    </div>
  ),
});

function FranchiseeDetailPage() {
  const { franchiseeId } = useParams({ from: "/app/franchisees/$franchiseeId" });
  const { isAdmin, hasRole } = useAuth();
  const canManage = isAdmin || hasRole("accounts");
  const qc = useQueryClient();

  const { data: f } = useQuery({
    queryKey: ["franchisee", franchiseeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("franchisees").select("*").eq("id", franchiseeId).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["franchisee-payouts", franchiseeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roi_payouts")
        .select("*")
        .eq("franchisee_id", franchiseeId)
        .order("payout_month", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("roi_payouts")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payout marked paid");
      qc.invalidateQueries({ queryKey: ["franchisee-payouts", franchiseeId] });
    },
  });

  if (!f) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  const lifetimePaid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
  const pending = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.total_amount), 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <Link to="/app/franchisees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="rounded-2xl glass p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl">{f.full_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{f.email ?? "—"} · {f.phone ?? "—"}</p>
            <Badge variant="outline" className="mt-3 border-gold/40 text-gold capitalize">{f.status}</Badge>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-background/40 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Investment</div>
            <div className="mt-1 font-display text-2xl text-gradient-gold">{formatINRCompact(Number(f.investment_amount))}</div>
          </div>
          <div className="rounded-xl bg-background/40 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lifetime ROI paid</div>
            <div className="mt-1 font-display text-2xl text-gradient-gold">{formatINRCompact(lifetimePaid)}</div>
          </div>
          <div className="rounded-xl bg-background/40 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending payouts</div>
            <div className="mt-1 font-display text-2xl text-gradient-gold">{formatINRCompact(pending)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl glass p-6">
        <h3 className="font-display text-xl">ROI ledger</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">Month</th>
                <th className="px-2 py-2 text-right">Base ROI</th>
                <th className="px-2 py-2 text-right">Emporium</th>
                <th className="px-2 py-2 text-right">Academy</th>
                <th className="px-2 py-2 text-right">Dark Store</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-center">Status</th>
                {canManage && <th className="px-2 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="px-2 py-2">{format(new Date(p.payout_month), "MMM yyyy")}</td>
                  <td className="px-2 py-2 text-right">{formatINRCompact(Number(p.base_roi))}</td>
                  <td className="px-2 py-2 text-right">{formatINRCompact(Number(p.emporium_incentive))}</td>
                  <td className="px-2 py-2 text-right">{formatINRCompact(Number(p.academy_incentive))}</td>
                  <td className="px-2 py-2 text-right">{formatINRCompact(Number(p.dark_store_incentive))}</td>
                  <td className="px-2 py-2 text-right font-semibold text-gold">{formatINRCompact(Number(p.total_amount))}</td>
                  <td className="px-2 py-2 text-center">
                    <Badge variant="outline" className={p.status === "paid" ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}>{p.status}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-2 py-2 text-right">
                      {p.status === "pending" && (
                        <Button size="sm" variant="ghost" onClick={() => markPaid.mutate(p.id)}>
                          <CheckCircle2 className="mr-1 h-3 w-3" />Mark paid
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {payouts.length === 0 && (
                <tr><td colSpan={canManage ? 8 : 7} className="px-2 py-8 text-center text-muted-foreground">No payouts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
