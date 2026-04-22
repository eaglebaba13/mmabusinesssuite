import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { formatINRCompact } from "@/lib/format";
import { format } from "date-fns";

export const Route = createFileRoute("/app/my-franchise")({
  head: () => ({ meta: [{ title: "My Franchise — MMA Suite" }] }),
  component: MyFranchisePage,
});

function MyFranchisePage() {
  const { user } = useAuth();
  const { data: f } = useQuery({
    queryKey: ["my-franchise", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("franchisees").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["my-payouts", f?.id],
    enabled: !!f?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("roi_payouts")
        .select("*")
        .eq("franchisee_id", f!.id)
        .order("payout_month", { ascending: false });
      return data ?? [];
    },
  });

  if (!f) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <h1 className="font-display text-3xl">No franchise on record</h1>
        <p className="mt-2 text-muted-foreground">Contact your account manager to link your franchise profile.</p>
      </div>
    );
  }

  const lifetimePaid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.total_amount), 0);
  const pending = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.total_amount), 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-gold">Franchisee Workspace</p>
        <h1 className="mt-1 font-display text-3xl">{f.full_name}</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl glass p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">My investment</div>
          <div className="mt-2 font-display text-3xl text-gradient-gold">{formatINRCompact(Number(f.investment_amount))}</div>
        </div>
        <div className="rounded-2xl glass p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Lifetime ROI paid</div>
          <div className="mt-2 font-display text-3xl text-gradient-gold">{formatINRCompact(lifetimePaid)}</div>
        </div>
        <div className="rounded-2xl glass p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Pending payouts</div>
          <div className="mt-2 font-display text-3xl text-gradient-gold">{formatINRCompact(pending)}</div>
        </div>
      </div>

      <div className="rounded-2xl glass p-6">
        <h3 className="font-display text-xl">My ROI history</h3>
        <div className="mt-4 space-y-2">
          {payouts.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg bg-background/40 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{format(new Date(p.payout_month), "MMMM yyyy")}</div>
                <div className="text-xs text-muted-foreground">
                  Base {formatINRCompact(Number(p.base_roi))} · Emporium {formatINRCompact(Number(p.emporium_incentive))} · Academy {formatINRCompact(Number(p.academy_incentive))}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-lg text-gold">{formatINRCompact(Number(p.total_amount))}</div>
                <Badge variant="outline" className={p.status === "paid" ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}>
                  {p.status}
                </Badge>
              </div>
            </div>
          ))}
          {payouts.length === 0 && <p className="text-sm text-muted-foreground">No payouts yet.</p>}
        </div>
      </div>

      <Link to="/app/support" className="block text-center text-sm text-gold hover:underline">
        Open a support ticket →
      </Link>
    </div>
  );
}
