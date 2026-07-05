import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listFranchiseProductTypes,
  listRevenueModels,
  upsertFranchiseProduct,
  type FranchiseProductRow,
  type ProductCommissionRow,
} from "@/lib/rpc/franchise-products.functions";

type CommissionKind =
  | "one_time"
  | "monthly"
  | "royalty"
  | "profit_share"
  | "recurring"
  | "bonus"
  | "performance_incentive"
  | "referral_bonus";

type CommissionFrequency = "one_time" | "monthly" | "quarterly" | "yearly" | "on_event";

type CommissionDraft = {
  kind: CommissionKind;
  label: string;
  amount: string;
  percent: string;
  frequency: CommissionFrequency | "";
  notes: string;
};

type FormState = {
  name: string;
  brand_name: string;
  brand_logo_url: string;
  category: string;
  type_id: string;
  revenue_model_id: string;

  investment_amount: string;
  gst_percent: string;
  security_deposit: string;
  lock_in_months: string;
  territory: string;

  royalty_percent: string;
  revenue_share_percent: string;
  minimum_guarantee: string;
  expected_roi_percent: string;
  roi_timeline_months: string;
  profit_margin_percent: string;

  brochure_url: string;
  video_url: string;

  short_description: string;
  long_description: string;
  highlights: string; // newline-separated
  requirements: string; // newline-separated

  status: "active" | "inactive" | "archived" | "draft";
  is_featured: boolean;

  commissions: CommissionDraft[];
};

function toFormState(
  product?: FranchiseProductRow,
  commissions: ProductCommissionRow[] = [],
): FormState {
  return {
    name: product?.name ?? "",
    brand_name: product?.brand_name ?? "",
    brand_logo_url: product?.brand_logo_url ?? "",
    category: product?.category ?? "",
    type_id: product?.type_id ?? "",
    revenue_model_id: product?.revenue_model_id ?? "",

    investment_amount: String(product?.investment_amount ?? "0"),
    gst_percent: String(product?.gst_percent ?? "18"),
    security_deposit: String(product?.security_deposit ?? "0"),
    lock_in_months: String(product?.lock_in_months ?? "0"),
    territory: product?.territory ?? "",

    royalty_percent: String(product?.royalty_percent ?? "0"),
    revenue_share_percent: String(product?.revenue_share_percent ?? "0"),
    minimum_guarantee: String(product?.minimum_guarantee ?? "0"),
    expected_roi_percent: product?.expected_roi_percent != null ? String(product.expected_roi_percent) : "",
    roi_timeline_months: product?.roi_timeline_months != null ? String(product.roi_timeline_months) : "",
    profit_margin_percent:
      product?.profit_margin_percent != null ? String(product.profit_margin_percent) : "",

    brochure_url: product?.brochure_url ?? "",
    video_url: product?.video_url ?? "",

    short_description: product?.short_description ?? "",
    long_description: product?.long_description ?? "",
    highlights: (product?.highlights ?? []).join("\n"),
    requirements: (product?.requirements ?? []).join("\n"),

    status: product?.status ?? "draft",
    is_featured: product?.is_featured ?? false,

    commissions: commissions.map((c) => ({
      kind: c.kind,
      label: c.label,
      amount: c.amount != null ? String(c.amount) : "",
      percent: c.percent != null ? String(c.percent) : "",
      frequency: c.frequency ?? "",
      notes: c.notes ?? "",
    })),
  };
}

function numOrZero(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(s: string): number | null {
  if (!s.trim()) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function ProductEditor({
  initialProduct,
  initialCommissions = [],
  onSaved,
  onCancel,
}: {
  initialProduct?: FranchiseProductRow;
  initialCommissions?: ProductCommissionRow[];
  onSaved: (id: string | null) => void;
  onCancel: () => void;
}) {
  const [state, setState] = React.useState<FormState>(() =>
    toFormState(initialProduct, initialCommissions),
  );
  const qc = useQueryClient();

  const listTypesFn = useServerFn(listFranchiseProductTypes);
  const listModelsFn = useServerFn(listRevenueModels);
  const upsertFn = useServerFn(upsertFranchiseProduct);

  const typesQ = useQuery({ queryKey: ["franchise-product-types"], queryFn: () => listTypesFn() });
  const modelsQ = useQuery({ queryKey: ["franchise-revenue-models"], queryFn: () => listModelsFn() });

  const upsert = useMutation({
    mutationFn: (payload: Record<string, unknown>) => upsertFn({ data: payload as never }),
    onSuccess: (res) => {
      toast.success(initialProduct ? "Product updated" : "Product created");
      qc.invalidateQueries({ queryKey: ["franchise-products"] });
      if (initialProduct?.id) {
        qc.invalidateQueries({ queryKey: ["franchise-product", initialProduct.id] });
      }
      onSaved(res.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function updateCommission(idx: number, patch: Partial<CommissionDraft>) {
    setState((s) => {
      const next = [...s.commissions];
      next[idx] = { ...next[idx], ...patch };
      return { ...s, commissions: next };
    });
  }

  function addCommission() {
    setState((s) => ({
      ...s,
      commissions: [
        ...s.commissions,
        { kind: "one_time", label: "", amount: "", percent: "", frequency: "", notes: "" },
      ],
    }));
  }

  function removeCommission(idx: number) {
    setState((s) => ({ ...s, commissions: s.commissions.filter((_, i) => i !== idx) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.name.trim()) {
      toast.error("Name is required");
      return;
    }
    upsert.mutate({
      id: initialProduct?.id,
      name: state.name.trim(),
      brand_name: state.brand_name.trim() || null,
      brand_logo_url: state.brand_logo_url.trim() || null,
      category: state.category.trim() || null,
      type_id: state.type_id || null,
      revenue_model_id: state.revenue_model_id || null,

      investment_amount: numOrZero(state.investment_amount),
      gst_percent: numOrZero(state.gst_percent),
      security_deposit: numOrZero(state.security_deposit),
      lock_in_months: Math.floor(numOrZero(state.lock_in_months)),
      territory: state.territory.trim() || null,

      royalty_percent: numOrZero(state.royalty_percent),
      revenue_share_percent: numOrZero(state.revenue_share_percent),
      minimum_guarantee: numOrZero(state.minimum_guarantee),
      expected_roi_percent: numOrNull(state.expected_roi_percent),
      roi_timeline_months:
        state.roi_timeline_months.trim() === ""
          ? null
          : Math.floor(numOrZero(state.roi_timeline_months)),
      profit_margin_percent: numOrNull(state.profit_margin_percent),

      brochure_url: state.brochure_url.trim() || null,
      video_url: state.video_url.trim() || null,

      short_description: state.short_description.trim() || null,
      long_description: state.long_description.trim() || null,
      highlights: state.highlights
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      requirements: state.requirements
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),

      status: state.status,
      is_featured: state.is_featured,

      commissions: state.commissions
        .filter((c) => c.label.trim())
        .map((c, idx) => ({
          kind: c.kind,
          label: c.label.trim(),
          amount: c.amount.trim() ? numOrZero(c.amount) : null,
          percent: c.percent.trim() ? numOrZero(c.percent) : null,
          frequency: (c.frequency || null) as CommissionFrequency | null,
          notes: c.notes.trim() || null,
          sort_order: idx,
        })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basics */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl">Basics</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="p-name">Product Name *</Label>
            <Input
              id="p-name"
              value={state.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. Cloud Nail Bar Franchise"
              required
            />
          </div>
          <div>
            <Label htmlFor="p-brand">Brand Name</Label>
            <Input
              id="p-brand"
              value={state.brand_name}
              onChange={(e) => update("brand_name", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="p-cat">Category</Label>
            <Input
              id="p-cat"
              value={state.category}
              onChange={(e) => update("category", e.target.value)}
              placeholder="Beauty & Wellness"
            />
          </div>
          <div>
            <Label>Franchise Type</Label>
            <Select value={state.type_id} onValueChange={(v) => update("type_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {(typesQ.data?.rows ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Revenue Model</Label>
            <Select
              value={state.revenue_model_id}
              onValueChange={(v) => update("revenue_model_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {(modelsQ.data?.rows ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="p-logo">Brand Logo URL</Label>
            <Input
              id="p-logo"
              value={state.brand_logo_url}
              onChange={(e) => update("brand_logo_url", e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label htmlFor="p-terr">Territory</Label>
            <Input
              id="p-terr"
              value={state.territory}
              onChange={(e) => update("territory", e.target.value)}
              placeholder="City / State / Pan India"
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={state.status} onValueChange={(v) => update("status", v as FormState["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              checked={state.is_featured}
              onCheckedChange={(v) => update("is_featured", v)}
              id="p-feat"
            />
            <Label htmlFor="p-feat" className="cursor-pointer">
              Feature this product on Marketplace
            </Label>
          </div>
        </div>
      </Card>

      {/* Financials */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl">Financials</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumField label="Investment (₹)" value={state.investment_amount} onChange={(v) => update("investment_amount", v)} />
          <NumField label="GST %" value={state.gst_percent} onChange={(v) => update("gst_percent", v)} />
          <NumField label="Security Deposit (₹)" value={state.security_deposit} onChange={(v) => update("security_deposit", v)} />
          <NumField label="Lock-in (months)" value={state.lock_in_months} onChange={(v) => update("lock_in_months", v)} />
          <NumField label="Royalty %" value={state.royalty_percent} onChange={(v) => update("royalty_percent", v)} />
          <NumField label="Revenue Share %" value={state.revenue_share_percent} onChange={(v) => update("revenue_share_percent", v)} />
          <NumField label="Minimum Guarantee (₹)" value={state.minimum_guarantee} onChange={(v) => update("minimum_guarantee", v)} />
          <NumField label="Expected ROI %" value={state.expected_roi_percent} onChange={(v) => update("expected_roi_percent", v)} placeholder="optional" />
          <NumField label="ROI Timeline (months)" value={state.roi_timeline_months} onChange={(v) => update("roi_timeline_months", v)} placeholder="optional" />
          <NumField label="Profit Margin %" value={state.profit_margin_percent} onChange={(v) => update("profit_margin_percent", v)} placeholder="optional" />
        </div>
      </Card>

      {/* Marketing */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl">Marketing</h2>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="p-short">Short Description</Label>
            <Input
              id="p-short"
              value={state.short_description}
              onChange={(e) => update("short_description", e.target.value)}
              placeholder="One-line pitch shown on cards"
            />
          </div>
          <div>
            <Label htmlFor="p-long">Long Description</Label>
            <Textarea
              id="p-long"
              value={state.long_description}
              onChange={(e) => update("long_description", e.target.value)}
              rows={4}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-broch">Brochure URL</Label>
              <Input
                id="p-broch"
                value={state.brochure_url}
                onChange={(e) => update("brochure_url", e.target.value)}
                placeholder="https://... (PDF)"
              />
            </div>
            <div>
              <Label htmlFor="p-video">Video URL</Label>
              <Input
                id="p-video"
                value={state.video_url}
                onChange={(e) => update("video_url", e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-hl">Highlights (one per line)</Label>
              <Textarea
                id="p-hl"
                value={state.highlights}
                onChange={(e) => update("highlights", e.target.value)}
                rows={4}
                placeholder={"3-day training\nNational marketing\nSoftware included"}
              />
            </div>
            <div>
              <Label htmlFor="p-req">Requirements (one per line)</Label>
              <Textarea
                id="p-req"
                value={state.requirements}
                onChange={(e) => update("requirements", e.target.value)}
                rows={4}
                placeholder={"500 sqft space\n2 trained staff\nGround floor"}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Commissions */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl">Commission Structure</h2>
          <Button type="button" variant="outline" size="sm" onClick={addCommission}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
        {state.commissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No commissions yet. Add one-time fees, monthly royalty, referral bonuses, etc.
          </p>
        ) : (
          <div className="space-y-3">
            {state.commissions.map((c, idx) => (
              <div
                key={idx}
                className="grid gap-2 rounded-lg border border-border/60 bg-background/40 p-3 md:grid-cols-6"
              >
                <div className="md:col-span-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Kind</Label>
                  <Select
                    value={c.kind}
                    onValueChange={(v) => updateCommission(idx, { kind: v as CommissionKind })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_time">One-time</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="royalty">Royalty</SelectItem>
                      <SelectItem value="profit_share">Profit share</SelectItem>
                      <SelectItem value="recurring">Recurring</SelectItem>
                      <SelectItem value="bonus">Bonus</SelectItem>
                      <SelectItem value="performance_incentive">Perf. incentive</SelectItem>
                      <SelectItem value="referral_bonus">Referral bonus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Label</Label>
                  <Input
                    className="h-9"
                    value={c.label}
                    onChange={(e) => updateCommission(idx, { label: e.target.value })}
                    placeholder="e.g. Franchise fee"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Amount ₹</Label>
                  <Input
                    className="h-9"
                    type="number"
                    step="0.01"
                    value={c.amount}
                    onChange={(e) => updateCommission(idx, { amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Percent %</Label>
                  <Input
                    className="h-9"
                    type="number"
                    step="0.01"
                    value={c.percent}
                    onChange={(e) => updateCommission(idx, { percent: e.target.value })}
                  />
                </div>
                <div className="flex items-end gap-1">
                  <div className="flex-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Frequency</Label>
                    <Select
                      value={c.frequency || "none"}
                      onValueChange={(v) =>
                        updateCommission(idx, {
                          frequency: v === "none" ? "" : (v as CommissionFrequency),
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="one_time">One-time</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                        <SelectItem value="on_event">On event</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => removeCommission(idx)}
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="md:col-span-6">
                  <Input
                    className="h-9"
                    placeholder="Notes (optional)"
                    value={c.notes}
                    onChange={(e) => updateCommission(idx, { notes: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {state.commissions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {["one_time", "monthly", "royalty"].map((k) => (
              <Badge key={k} variant="outline" className="text-[10px] capitalize">
                {state.commissions.filter((c) => c.kind === k).length} × {k.replace("_", " ")}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <div className="sticky bottom-0 z-10 -mx-6 flex items-center justify-end gap-3 border-t border-border/50 bg-background/95 px-6 py-4 backdrop-blur">
        <Button type="button" variant="ghost" onClick={onCancel}>
          <X className="mr-2 h-4 w-4" /> Cancel
        </Button>
        <Button type="submit" disabled={upsert.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {upsert.isPending ? "Saving..." : initialProduct ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
