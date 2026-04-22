import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  TrendingUp,
  ShoppingCart,
  Wallet,
  Receipt,
  MessageSquare,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatINRCompact } from "@/lib/format";

interface Props {
  franchiseeId: string;
  territoryId: string | null;
}

interface FeedItem {
  id: string;
  ts: string;
  kind: "revenue" | "order" | "payout" | "expense" | "lead_activity";
  title: string;
  detail: string;
  amount?: number;
}

export function FranchiseeTimeline({ franchiseeId, territoryId }: Props) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["fr-timeline", franchiseeId, territoryId],
    queryFn: async () => {
      const [rev, ord, pay, exp, act] = await Promise.all([
        supabase
          .from("revenue_entries")
          .select("id, amount, source, source_label, received_on, created_at")
          .eq("franchisee_id", franchiseeId)
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("sales_orders")
          .select("id, grand_total, customer_name, invoice_number, status, created_at")
          .eq("franchisee_id", franchiseeId)
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("roi_payouts")
          .select("id, total_amount, status, payout_month, created_at, paid_at")
          .eq("franchisee_id", franchiseeId)
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("expenses")
          .select("id, amount, vendor, description, expense_date, created_at")
          .eq("franchisee_id", franchiseeId)
          .order("created_at", { ascending: false })
          .limit(15),
        territoryId
          ? supabase
              .from("lead_activities")
              .select("id, activity_type, content, created_at, lead_id, leads!inner(full_name, territory_id)")
              .eq("leads.territory_id", territoryId)
              .order("created_at", { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const feed: FeedItem[] = [];

      (rev.data ?? []).forEach((r: any) =>
        feed.push({
          id: `rev-${r.id}`,
          ts: r.created_at,
          kind: "revenue",
          title: "Revenue recorded",
          detail: r.source_label || r.source,
          amount: Number(r.amount),
        }),
      );

      (ord.data ?? []).forEach((o: any) =>
        feed.push({
          id: `ord-${o.id}`,
          ts: o.created_at,
          kind: "order",
          title: `Order ${o.invoice_number ?? "#" + o.id.slice(0, 6)}`,
          detail: `${o.customer_name ?? "Walk-in"} · ${o.status}`,
          amount: Number(o.grand_total),
        }),
      );

      (pay.data ?? []).forEach((p: any) =>
        feed.push({
          id: `pay-${p.id}`,
          ts: p.paid_at || p.created_at,
          kind: "payout",
          title: `ROI payout — ${format(new Date(p.payout_month), "MMM yyyy")}`,
          detail: p.status,
          amount: Number(p.total_amount),
        }),
      );

      (exp.data ?? []).forEach((e: any) =>
        feed.push({
          id: `exp-${e.id}`,
          ts: e.created_at,
          kind: "expense",
          title: "Expense logged",
          detail: e.vendor || e.description || "Expense",
          amount: Number(e.amount),
        }),
      );

      (act.data ?? []).forEach((a: any) =>
        feed.push({
          id: `act-${a.id}`,
          ts: a.created_at,
          kind: "lead_activity",
          title: `Lead — ${a.leads?.full_name ?? "Unknown"}`,
          detail: `${a.activity_type}${a.content ? ": " + a.content.slice(0, 80) : ""}`,
        }),
      );

      feed.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      return feed.slice(0, 25);
    },
  });

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-gold" />
        <h3 className="font-display text-lg">Account update timeline</h3>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No activity yet. Updates from admins (revenue, orders, payouts, leads) will appear here in real time.
        </p>
      ) : (
        <ol className="relative space-y-3 border-l border-border/50 pl-5">
          {items.map((it) => (
            <li key={it.id} className="relative">
              <span className="absolute -left-[26px] flex h-4 w-4 items-center justify-center rounded-full bg-card ring-2 ring-gold/30">
                <KindIcon kind={it.kind} />
              </span>
              <div className="rounded-lg bg-background/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{it.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(it.ts), "dd MMM HH:mm")}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground capitalize">{it.detail}</span>
                  {it.amount !== undefined && (
                    <span className={`font-display ${it.kind === "expense" ? "text-rose-400" : "text-gold"}`}>
                      {it.kind === "expense" ? "−" : "+"}
                      {formatINRCompact(it.amount)}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function KindIcon({ kind }: { kind: FeedItem["kind"] }) {
  const cls = "h-2.5 w-2.5 text-gold";
  if (kind === "revenue") return <TrendingUp className={cls} />;
  if (kind === "order") return <ShoppingCart className={cls} />;
  if (kind === "payout") return <Wallet className={cls} />;
  if (kind === "expense") return <Receipt className={cls} />;
  return <MessageSquare className={cls} />;
}
