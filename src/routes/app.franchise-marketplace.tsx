import * as React from "react";
import { BrandLogo } from "@/components/app/franchise/BrandLogo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Search,
  Store,
  Package,
  TrendingUp,
  Percent,
  Coins,
  Download,
  GitCompareArrows,
  ArrowRight,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINRCompact } from "@/lib/format";
import {
  listFranchiseProducts,
  listFranchiseProductTypes,
} from "@/lib/rpc/franchise-products.functions";

export const Route = createFileRoute("/app/franchise-marketplace")({
  head: () => ({
    meta: [
      { title: "Franchise Marketplace — MMA Suite" },
      {
        name: "description",
        content: "Browse and compare every franchise product on offer.",
      },
    ],
  }),
  component: MarketplacePage,
});

function MarketplacePage() {
  const listFn = useServerFn(listFranchiseProducts);
  const listTypesFn = useServerFn(listFranchiseProductTypes);

  const productsQ = useQuery({ queryKey: ["franchise-products"], queryFn: () => listFn() });
  const typesQ = useQuery({ queryKey: ["franchise-product-types"], queryFn: () => listTypesFn() });

  const { isAdmin, hasRole } = useAuth();
  const canEnquire = isAdmin || hasRole("sales");
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [enquireFor, setEnquireFor] = React.useState<{ id: string; name: string } | null>(null);
  const [enq, setEnq] = React.useState({ full_name: "", email: "", phone: "", city: "" });
  const [saving, setSaving] = React.useState(false);

  async function submitEnquiry() {
    if (!enquireFor || !enq.full_name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("leads").insert({
      full_name: enq.full_name.trim(),
      email: enq.email.trim() || null,
      phone: enq.phone.trim() || null,
      city: enq.city.trim() || null,
      source: "referral" as any,
      stage: "new" as any,
      franchise_product_id: enquireFor.id,
      interest_stage: "interested",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Lead created for ${enquireFor.name}`);
    setEnquireFor(null);
    setEnq({ full_name: "", email: "", phone: "", city: "" });
  }

  const typeLabelById = React.useMemo(() => {
    const m = new Map<string, string>();
    (typesQ.data?.rows ?? []).forEach((t) => m.set(t.id, t.label));
    return m;
  }, [typesQ.data]);

  const rows = (productsQ.data?.rows ?? []).filter((p) => p.status === "active");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (typeFilter !== "all" && p.type_id !== typeFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand_name ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  }

  const compareHref =
    selected.size >= 2 ? `/app/franchise-compare?ids=${Array.from(selected).join(",")}` : null;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-3xl text-gradient-gold">
            <Store className="h-8 w-8 text-primary" /> Franchise Marketplace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse every active franchise offering. Select up to 4 to compare side-by-side.
          </p>
        </div>
        {selected.size >= 2 && compareHref && (
          <Button asChild>
            <a href={compareHref}>
              <GitCompareArrows className="mr-2 h-4 w-4" /> Compare {selected.size}
            </a>
          </Button>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search franchise, brand, category..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(typesQ.data?.rows ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        )}
      </div>

      {productsQ.isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-72 animate-pulse bg-card/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed p-16 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 font-display text-xl">No products available yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Once admins publish franchise products, they'll appear here.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const isSel = selected.has(p.id);
            return (
              <Card
                key={p.id}
                className={`group relative flex flex-col overflow-hidden border-border/60 bg-card/80 transition-all hover:-translate-y-0.5 hover:shadow-gold ${isSel ? "border-primary ring-1 ring-primary/40" : "hover:border-primary/40"}`}
              >
                <div className="absolute right-3 top-3 z-10">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md bg-background/80 px-2 py-1 text-xs backdrop-blur">
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={() => toggle(p.id)}
                      className="h-3.5 w-3.5"
                    />
                    Compare
                  </label>
                </div>

                <div className="flex items-start gap-3 p-5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 ring-1 ring-border">
                    {p.brand_logo ? (
                      <BrandLogo path={p.brand_logo} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pr-16">
                    <h3 className="truncate font-display text-lg leading-tight">{p.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.brand_name ?? p.category ?? "—"}
                    </p>
                    {p.type_id && typeLabelById.get(p.type_id) && (
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        {typeLabelById.get(p.type_id)}
                      </Badge>
                    )}
                  </div>
                </div>

                {p.short_description && (
                  <p className="line-clamp-2 px-5 pb-3 text-xs text-muted-foreground">
                    {p.short_description}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3 border-t border-border/50 bg-background/40 px-5 py-4">
                  <MiniStat label="Investment" value={formatINRCompact(p.investment_amount)} icon={Coins} />
                  <MiniStat
                    label="ROI"
                    value={p.expected_roi_percent != null ? `${p.expected_roi_percent}%` : "—"}
                    icon={TrendingUp}
                  />
                  <MiniStat label="Royalty" value={`${p.royalty_percent}%`} icon={Percent} />
                  <MiniStat
                    label="Lock-in"
                    value={p.lock_in_months ? `${p.lock_in_months}mo` : "—"}
                    icon={Coins}
                  />
                </div>

                <div className="mt-auto flex items-center gap-2 border-t border-border/50 p-3">
                  {p.brochure_url && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={p.brochure_url} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-1 h-3.5 w-3.5" /> Brochure
                      </a>
                    </Button>
                  )}
                  {canEnquire && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setEnquireFor({ id: p.id, name: p.name })}
                    >
                      <UserPlus className="mr-1 h-3.5 w-3.5" /> Enquire
                    </Button>
                  )}
                  <Button variant="default" size="sm" className={canEnquire ? "" : "ml-auto"} asChild>
                    <Link to="/app/franchise-products/$productId" params={{ productId: p.id }}>
                      Details <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!enquireFor} onOpenChange={(v) => !v && setEnquireFor(null)}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Add enquiry — {enquireFor?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Full name *</Label>
              <Input
                className="mt-1"
                value={enq.full_name}
                onChange={(e) => setEnq({ ...enq, full_name: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  className="mt-1"
                  value={enq.email}
                  onChange={(e) => setEnq({ ...enq, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  className="mt-1"
                  value={enq.phone}
                  onChange={(e) => setEnq({ ...enq, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>City</Label>
              <Input
                className="mt-1"
                value={enq.city}
                onChange={(e) => setEnq({ ...enq, city: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Creates a lead tagged with this product at stage "Interested".
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnquireFor(null)}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-gold text-background"
              onClick={submitEnquiry}
              disabled={saving || !enq.full_name.trim()}
            >
              {saving ? "Saving…" : "Create lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
