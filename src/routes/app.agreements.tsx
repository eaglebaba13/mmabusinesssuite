import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSignature, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

export const Route = createFileRoute("/app/agreements")({
  head: () => ({ meta: [{ title: "Agreements — MMA Suite" }] }),
  component: AgreementsPage,
});

type Row = {
  id: string;
  product_id: string;
  franchisee_id: string;
  version: string;
  status: string;
  valid_from: string | null;
  valid_till: string | null;
  created_at: string;
};

function AgreementsPage() {
  const [status, setStatus] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["agreements-all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_agreements")
        .select("id,product_id,franchisee_id,version,status,valid_from,valid_till,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["all-products-min"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_products")
        .select("id,name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: franchisees = [] } = useQuery({
    queryKey: ["all-franchisees-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("franchisees").select("id,full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const productMap = new Map<string, string>(products.map((p: any) => [String(p.id), String(p.name)]));
  const franchiseeMap = new Map<string, string>(franchisees.map((f: any) => [String(f.id), String(f.full_name)]));

  const filtered = rows.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      const pn = String(productMap.get(r.product_id) ?? "").toLowerCase();
      const fn = String(franchiseeMap.get(r.franchisee_id) ?? "").toLowerCase();
      if (!pn.includes(q) && !fn.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Franchise Network</p>
          <h1 className="mt-1 font-display text-3xl">Agreements</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search product or franchisee…"
              className="h-9 w-[280px] bg-card/40 pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-border bg-card/40 px-2 text-sm"
          >
            <option value="all">All status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="signed">Signed</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FileSignature className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">No agreements yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Open a product and use the Agreement tab to generate one.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-background/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-3">Product</th>
                <th className="p-3">Franchisee</th>
                <th className="p-3">Version</th>
                <th className="p-3">Valid</th>
                <th className="p-3">Created</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/30 last:border-0 hover:bg-background/30">
                  <td className="p-3">
                    <Link
                      to="/app/franchise-products/$productId"
                      params={{ productId: r.product_id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {productMap.get(r.product_id) ?? "—"}
                    </Link>
                  </td>
                  <td className="p-3">
                    <Link
                      to="/app/franchisees/$franchiseeId"
                      params={{ franchiseeId: r.franchisee_id }}
                      className="hover:underline"
                    >
                      {franchiseeMap.get(r.franchisee_id) ?? "—"}
                    </Link>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{r.version}</td>
                  <td className="p-3 text-xs">
                    {r.valid_from ?? "—"} → {r.valid_till ?? "—"}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {format(new Date(r.created_at), "dd MMM yyyy")}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="capitalize">{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
