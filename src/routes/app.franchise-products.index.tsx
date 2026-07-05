import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Copy,
  Archive,
  Star,
  Package,
  TrendingUp,
  Percent,
  Coins,
  ScrollText,
  ExternalLink,
  Store,
  GitCompareArrows,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINRCompact } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import {
  listFranchiseProducts,
  listFranchiseProductTypes,
  duplicateFranchiseProduct,
  setFranchiseProductStatus,
  type FranchiseProductRow,
  type FranchiseProductTypeRow,
} from "@/lib/rpc/franchise-products.functions";

export const Route = createFileRoute("/app/franchise-products/")({
  head: () => ({
    meta: [
      { title: "Franchise Products — MMA Suite" },
      { name: "description", content: "Manage your franchise product catalog." },
    ],
  }),
  component: FranchiseProductsPage,
});

function FranchiseProductsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const listFn = useServerFn(listFranchiseProducts);
  const listTypesFn = useServerFn(listFranchiseProductTypes);
  const dupFn = useServerFn(duplicateFranchiseProduct);
  const statusFn = useServerFn(setFranchiseProductStatus);

  const productsQ = useQuery({
    queryKey: ["franchise-products"],
    queryFn: () => listFn(),
  });
  const typesQ = useQuery({
    queryKey: ["franchise-product-types"],
    queryFn: () => listTypesFn(),
  });

  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const typesById = React.useMemo(() => {
    const m = new Map<string, FranchiseProductTypeRow>();
    (typesQ.data?.rows ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [typesQ.data]);

  const rows = productsQ.data?.rows ?? [];
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (typeFilter !== "all" && p.type_id !== typeFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand_name ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter, statusFilter]);

  const dupMut = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: (res) => {
      toast.success("Product duplicated");
      qc.invalidateQueries({ queryKey: ["franchise-products"] });
      if (res.id) navigate({ to: "/app/franchise-products/$productId", params: { productId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => statusFn({ data: { id, status: "archived" } }),
    onSuccess: () => {
      toast.success("Product archived");
      qc.invalidateQueries({ queryKey: ["franchise-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-gradient-gold">Franchise Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Design, price, and launch every franchise model your brand offers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/app/franchise-marketplace">
              <Store className="mr-2 h-4 w-4" /> Marketplace
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/app/franchise-compare">
              <GitCompareArrows className="mr-2 h-4 w-4" /> Compare
            </Link>
          </Button>
          {isAdmin && (
            <Button asChild>
              <Link to="/app/franchise-products/new">
                <Plus className="mr-2 h-4 w-4" /> New Product
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, brand, category..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {productsQ.isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-64 animate-pulse bg-card/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState isAdmin={isAdmin} hasAny={rows.length > 0} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              typeLabel={p.type_id ? typesById.get(p.type_id)?.label ?? null : null}
              isAdmin={isAdmin}
              onDuplicate={() => dupMut.mutate(p.id)}
              onArchive={() => archiveMut.mutate(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ isAdmin, hasAny }: { isAdmin: boolean; hasAny: boolean }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 border-dashed p-16 text-center">
      <Package className="h-12 w-12 text-muted-foreground" />
      <div>
        <h3 className="font-display text-xl">
          {hasAny ? "No products match your filters" : "No franchise products yet"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasAny
            ? "Try clearing filters or search."
            : "Create your first franchise product to start selling."}
        </p>
      </div>
      {isAdmin && !hasAny && (
        <Button asChild>
          <Link to="/app/franchise-products/new">
            <Plus className="mr-2 h-4 w-4" /> New Product
          </Link>
        </Button>
      )}
    </Card>
  );
}

function ProductCard({
  product,
  typeLabel,
  isAdmin,
  onDuplicate,
  onArchive,
}: {
  product: FranchiseProductRow;
  typeLabel: string | null;
  isAdmin: boolean;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  const statusVariant =
    product.status === "active"
      ? "default"
      : product.status === "draft"
        ? "secondary"
        : product.status === "archived"
          ? "outline"
          : "outline";

  return (
    <Card className="group relative flex flex-col overflow-hidden border-border/60 bg-card/80 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-gold">
      {product.is_featured && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
          <Star className="h-3 w-3 fill-primary" /> Featured
        </div>
      )}

      <div className="flex items-start gap-3 p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 ring-1 ring-border">
          {product.brand_logo ? (
            <BrandLogo
              path={product.brand_logo}
              alt={product.brand_name ?? product.name}
              className="h-full w-full object-contain"
            />
          ) : (
            <Package className="h-6 w-6 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg leading-tight">{product.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {product.brand_name ?? product.category ?? "—"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {typeLabel && (
              <Badge variant="outline" className="text-[10px]">
                {typeLabel}
              </Badge>
            )}
            <Badge variant={statusVariant} className="text-[10px] capitalize">
              {product.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border/50 bg-background/40 px-5 py-4">
        <Stat label="Investment" value={formatINRCompact(product.investment_amount)} icon={Coins} />
        <Stat
          label="Expected ROI"
          value={product.expected_roi_percent != null ? `${product.expected_roi_percent}%` : "—"}
          icon={TrendingUp}
        />
        <Stat label="Royalty" value={`${product.royalty_percent}%`} icon={Percent} />
        <Stat
          label="Lock-in"
          value={product.lock_in_months ? `${product.lock_in_months} mo` : "—"}
          icon={ScrollText}
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 p-3">
        <Button variant="ghost" size="sm" asChild>
          <Link
            to="/app/franchise-products/$productId"
            params={{ productId: product.id }}
            className="flex items-center gap-1"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </Link>
        </Button>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" title="Duplicate" onClick={onDuplicate}>
              <Copy className="h-4 w-4" />
            </Button>
            {product.status !== "archived" && (
              <Button variant="ghost" size="icon" title="Archive" onClick={onArchive}>
                <Archive className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({
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
