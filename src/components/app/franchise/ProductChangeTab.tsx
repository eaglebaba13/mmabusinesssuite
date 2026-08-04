import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Package, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandLogo } from "@/components/app/franchise/BrandLogo";
import { ProductHistoryList } from "@/components/app/franchise/ProductHistoryList";
import { formatINR } from "@/lib/format";
import {
  buildDiff,
  productDefaults,
  CHANGE_REASONS,
  type DiffRow,
  type FranchiseeCommercials,
  type ProductCommission,
  type ProductTemplate,
} from "@/lib/franchise-product-map";

const PRODUCT_COLS =
  "id,name,brand_name,brand_logo,category,investment_amount,royalty_percent,revenue_share_percent,minimum_guarantee,expected_roi_percent,lock_in_months,agreement_template,status";

type FranchiseeLike = {
  id: string;
  full_name: string;
  franchise_product_id?: string | null;
  effective_product_date?: string | null;
  investment_amount: number;
  franchise_fee: number;
  mg_percent?: number | null;
  tns_percent?: number | null;
  academy_percent?: number | null;
  mall_percent?: number | null;
  royalty_percent?: number | null;
  franchise_commission_amount?: number | null;
  agreement_version?: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

function currentCommercials(f: FranchiseeLike): FranchiseeCommercials {
  return {
    investment_amount: Number(f.investment_amount ?? 0),
    franchise_fee: Number(f.franchise_fee ?? 0),
    mg_percent: Number(f.mg_percent ?? 0),
    tns_percent: Number(f.tns_percent ?? 0),
    academy_percent: Number(f.academy_percent ?? 0),
    mall_percent: Number(f.mall_percent ?? 0),
    royalty_percent: Number(f.royalty_percent ?? 0),
    franchise_commission_amount: Number(f.franchise_commission_amount ?? 0),
    agreement_version: f.agreement_version ?? null,
  };
}

export function ProductChangeTab({
  franchisee,
  onChanged,
}: {
  franchisee: FranchiseeLike;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const { isAdmin, user } = useAuth();
  const canChange = isAdmin;

  const [selectedId, setSelectedId] = React.useState<string>(franchisee.franchise_product_id ?? "");
  const [effectiveDate, setEffectiveDate] = React.useState<string>(
    franchisee.effective_product_date ?? today(),
  );
  const [reason, setReason] = React.useState<string>("Upgrade");
  const [remarks, setRemarks] = React.useState("");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [warnMode, setWarnMode] = React.useState<null | "keep_existing" | "apply_defaults">(null);

  React.useEffect(() => {
    setSelectedId(franchisee.franchise_product_id ?? "");
    setEffectiveDate(franchisee.effective_product_date ?? today());
  }, [franchisee.id, franchisee.franchise_product_id, franchisee.effective_product_date]);

  const { data: products = [] } = useQuery({
    queryKey: ["franchise_products_for_change"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_products")
        .select(PRODUCT_COLS)
        .in("status", ["active"])
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductTemplate[];
    },
  });

  // The currently assigned product may be inactive/archived — fetch it separately.
  const { data: assigned } = useQuery({
    queryKey: ["franchise_product_one", franchisee.franchise_product_id],
    enabled: !!franchisee.franchise_product_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_products")
        .select(PRODUCT_COLS)
        .eq("id", franchisee.franchise_product_id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProductTemplate | null;
    },
  });

  const catalog = React.useMemo(() => {
    const map = new Map<string, ProductTemplate>();
    for (const p of products) map.set(p.id, p);
    if (assigned && !map.has(assigned.id)) map.set(assigned.id, assigned);
    return map;
  }, [products, assigned]);

  const productNames = React.useMemo(
    () => Object.fromEntries([...catalog.values()].map((p) => [p.id, p.name])),
    [catalog],
  );

  const selected = selectedId ? catalog.get(selectedId) : undefined;

  const { data: commissions = [] } = useQuery({
    queryKey: ["franchise_product_commissions", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_product_commissions")
        .select("kind,label,amount,percent")
        .eq("product_id", selectedId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ProductCommission[];
    },
  });

  // Historical footprint — used to warn before changing product.
  const { data: footprint } = useQuery({
    queryKey: ["franchisee-footprint", franchisee.id],
    queryFn: async () => {
      const [inv, payouts] = await Promise.all([
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("franchisee_id", franchisee.id),
        supabase
          .from("roi_payouts")
          .select("id", { count: "exact", head: true })
          .eq("franchisee_id", franchisee.id),
      ]);
      return { invoices: inv.count ?? 0, payouts: payouts.count ?? 0 };
    },
  });

  const current = currentCommercials(franchisee);
  const defaults = selected ? productDefaults(selected, commissions, current) : current;
  const diff = buildDiff(current, defaults);
  const isSameProduct = (franchisee.franchise_product_id ?? "") === selectedId;
  const hasHistory = (footprint?.invoices ?? 0) > 0 || (footprint?.payouts ?? 0) > 0;

  const apply = useMutation({
    mutationFn: async (mode: "keep_existing" | "apply_defaults") => {
      if (!selected) throw new Error("Select a franchise product first");
      const patch: Record<string, unknown> = {
        franchise_product_id: selected.id,
        effective_product_date: effectiveDate,
        product_change_reason: reason,
        product_change_note: remarks || null,
      };
      if (mode === "apply_defaults") Object.assign(patch, defaults);

      const { error } = await supabase.from("franchisees").update(patch as never).eq("id", franchisee.id);
      if (error) throw error;

      await (supabase as any).from("franchise_product_changes").insert({
        franchisee_id: franchisee.id,
        old_product_id: franchisee.franchise_product_id ?? null,
        new_product_id: selected.id,
        old_values_json: current,
        new_values_json: mode === "apply_defaults" ? defaults : current,
        mode,
        reason,
        remarks: remarks || null,
        effective_date: effectiveDate,
        changed_by: user?.id ?? null,
      });

      await supabase.from("audit_logs").insert({
        action: "franchise_product_change",
        entity: "franchisees",
        entity_id: franchisee.id,
        user_id: user?.id ?? null,
        metadata: {
          franchisee_name: franchisee.full_name,
          old_product: franchisee.franchise_product_id
            ? (productNames[franchisee.franchise_product_id] ?? franchisee.franchise_product_id)
            : null,
          new_product: selected.name,
          mode,
          reason,
          remarks,
          effective_date: effectiveDate,
        },
      } as never);
    },
    onSuccess: () => {
      toast.success("Franchise product updated");
      setPreviewOpen(false);
      setWarnMode(null);
      setRemarks("");
      for (const key of [
        ["franchisees"],
        ["franchisee", franchisee.id],
        ["fr-dash-record", franchisee.id],
        ["franchise-product-changes", franchisee.id],
        ["monthly-roi", franchisee.id],
      ]) {
        qc.invalidateQueries({ queryKey: key });
      }
      onChanged?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Product change failed"),
  });

  const requestApply = (mode: "keep_existing" | "apply_defaults") => {
    if (hasHistory) setWarnMode(mode);
    else apply.mutate(mode);
  };

  return (
    <div className="space-y-4">
      {!canChange && (
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Read-only — only Super Admin / Founder can change the
          assigned franchise product.
        </div>
      )}

      {/* Section 1 — Current product */}
      <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
        <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
          Current product
        </h3>
        <div className="mt-3">
          <Label>Assigned franchise product</Label>
          <Select value={selectedId} onValueChange={setSelectedId} disabled={!canChange}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="— Select a product —" />
            </SelectTrigger>
            <SelectContent>
              {[...catalog.values()].map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.status !== "active" ? " (inactive)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {catalog.size === 0 && (
            <p className="mt-2 text-xs text-amber-400">
              No active franchise products yet. Create one in Franchise Products.
            </p>
          )}
        </div>

        {selected && (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-gold/25 bg-gold/5 p-4">
            <BrandLogo
              path={selected.brand_logo}
              alt={selected.name}
              className="h-12 w-12 rounded-lg object-contain"
              fallback={
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-gold">
                  <Package className="h-5 w-5 text-background" />
                </div>
              }
            />
            <div className="min-w-40 flex-1">
              <div className="font-display text-lg">{selected.name}</div>
              <div className="text-xs text-muted-foreground">
                {selected.brand_name ?? "—"} · {selected.category ?? "Uncategorised"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="border-gold/40 text-gold">
                {formatINR(Number(selected.investment_amount))}
              </Badge>
              <Badge variant="outline">Lock-in {selected.lock_in_months} mo</Badge>
              <Badge variant="outline">Royalty {Number(selected.royalty_percent)}%</Badge>
              <Badge variant="outline">
                ROI {selected.expected_roi_percent == null ? "—" : `${Number(selected.expected_roi_percent)}%`}
              </Badge>
            </div>
          </div>
        )}
      </section>

      {/* Section 2 — Product details (read only) */}
      {selected && (
        <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
          <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
            Product defaults (read only)
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Investment" value={formatINR(defaults.investment_amount)} />
            <Tile label="Royalty" value={`${defaults.royalty_percent}%`} />
            <Tile label="MG %" value={`${defaults.mg_percent}%`} />
            <Tile label="TNS %" value={`${defaults.tns_percent}%`} />
            <Tile label="Academy %" value={`${defaults.academy_percent}%`} />
            <Tile label="Mall of Salon %" value={`${defaults.mall_percent}%`} />
            <Tile label="Commission" value={formatINR(defaults.franchise_commission_amount)} />
            <Tile label="Agreement template" value={defaults.agreement_version ?? "—"} />
          </div>
        </section>
      )}

      {/* Section 3 — Change metadata */}
      <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
        <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
          Change details
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Effective date</Label>
            <Input
              type="date"
              value={effectiveDate}
              disabled={!canChange}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason} disabled={!canChange}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANGE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3">
          <Label>Remarks</Label>
          <Textarea
            rows={3}
            value={remarks}
            disabled={!canChange}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Why is this product being changed?"
            className="mt-1"
          />
        </div>
      </section>

      {/* Section 4 — Actions */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={!canChange}
          onClick={() => {
            setSelectedId(franchisee.franchise_product_id ?? "");
            setRemarks("");
          }}
        >
          Reset
        </Button>
        <Button
          variant="outline"
          disabled={!canChange || !selected || isSameProduct}
          onClick={() => setPreviewOpen(true)}
        >
          Preview changes
        </Button>
        <Button
          className="bg-gradient-gold text-background"
          disabled={!canChange || !selected || isSameProduct || apply.isPending}
          onClick={() => setPreviewOpen(true)}
        >
          Change product
        </Button>
      </div>

      {isSameProduct && selected && (
        <p className="text-right text-[11px] text-muted-foreground">
          This product is already assigned. Pick a different product to enable the change.
        </p>
      )}

      {/* History */}
      <section className="rounded-2xl border border-border/60 bg-background/40 p-4">
        <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
          Product change history
        </h3>
        <div className="mt-3">
          <ProductHistoryList franchiseeId={franchisee.id} productNames={productNames} />
        </div>
      </section>

      {/* Preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Change franchise product</DialogTitle>
          </DialogHeader>

          <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current product</div>
            <div>
              {franchisee.franchise_product_id
                ? (productNames[franchisee.franchise_product_id] ?? "—")
                : "None assigned"}
            </div>
            <div className="my-2 flex items-center gap-1 text-gold">
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider">New product</span>
            </div>
            <div className="font-medium">{selected?.name ?? "—"}</div>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Applying product defaults will update the following values:
          </p>
          <div className="space-y-1.5">
            {diff.map((row) => (
              <DiffLine key={row.key} row={row} />
            ))}
          </div>

          <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={apply.isPending}
              onClick={() => requestApply("keep_existing")}
            >
              Keep existing agreement values
            </Button>
            <Button
              className="bg-gradient-gold text-background"
              disabled={apply.isPending}
              onClick={() => requestApply("apply_defaults")}
            >
              {apply.isPending ? "Applying…" : "Apply product defaults"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historical-data warning */}
      <Dialog open={!!warnMode} onOpenChange={(o) => !o && setWarnMode(null)}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <AlertTriangle className="h-4 w-4 text-amber-400" /> Existing financial history
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This franchise already has {footprint?.invoices ?? 0} invoice(s) and {footprint?.payouts ?? 0} ROI
            payout record(s). Changing the product affects only future calculations — historical invoices,
            payouts, commissions, agreements and ROI records remain unchanged. Continue?
          </p>
          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setWarnMode(null)}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-gold text-background"
              disabled={apply.isPending}
              onClick={() => warnMode && apply.mutate(warnMode)}
            >
              {apply.isPending ? "Applying…" : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function fmt(row: DiffRow, side: "from" | "to") {
  const v = row[side];
  if (v === null || v === "") return "—";
  if (row.kind === "currency") return formatINR(Number(v));
  if (row.kind === "percent") return `${Number(v)}%`;
  return String(v);
}

function DiffLine({ row }: { row: DiffRow }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
        row.changed ? "border-gold/30 bg-gold/5" : "border-border/40 bg-background/30"
      }`}
    >
      <span className="text-xs text-muted-foreground">{row.label}</span>
      <span className="flex items-center gap-2">
        <span className={row.changed ? "text-muted-foreground line-through" : ""}>{fmt(row, "from")}</span>
        {row.changed && (
          <>
            <ArrowRight className="h-3 w-3 text-gold" />
            <span className="font-medium">{fmt(row, "to")}</span>
          </>
        )}
      </span>
    </div>
  );
}
