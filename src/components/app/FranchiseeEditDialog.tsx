import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resetFranchiseePassword } from "@/lib/rpc/franchisee-user.functions";
import { formatINR } from "@/lib/format";

interface Franchisee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  franchise_fee: number;
  investment_amount: number;
  base_roi_pct: number;
  emporium_pct: number;
  academy_pct: number;
  dark_store_pct: number;
  area_sqft: number | null;
  chairs: number;
  tables_count: number;
  cctv_count: number;
  computer_count: number;
  printer_count: number;
  user_id: string | null;
  // agreement engine
  agreement_version?: string | null;
  agreement_date?: string | null;
  agreement_expiry?: string | null;
  franchise_type?: "master" | "state" | "city";
  mg_percent?: number;
  tns_percent?: number;
  academy_percent?: number;
  mall_percent?: number;
  royalty_percent?: number;
  franchise_commission_amount?: number;
  franchise_product_id?: string | null;
  effective_product_date?: string | null;
}

interface Props {
  franchisee: Franchisee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FEE_PRESETS = ["500000", "1000000", "custom"] as const;

export function FranchiseeEditDialog({ franchisee, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const resetFn = useServerFn(resetFranchiseePassword);
  const [form, setForm] = React.useState<Franchisee | null>(franchisee);
  const [feePreset, setFeePreset] = React.useState<string>("500000");
  const [newPassword, setNewPassword] = React.useState<string | null>(null);
  const [resetting, setResetting] = React.useState(false);

  React.useEffect(() => {
    setForm(franchisee);
    setNewPassword(null);
    if (franchisee) {
      const fee = String(franchisee.franchise_fee);
      setFeePreset(FEE_PRESETS.includes(fee as any) ? fee : "custom");
    }
  }, [franchisee]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase
        .from("franchisees")
        .update({
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          notes: form.notes,
          franchise_fee: Number(form.franchise_fee),
          investment_amount: Number(form.investment_amount ?? form.franchise_fee),
          base_roi_pct: Number(form.base_roi_pct),
          emporium_pct: Number(form.emporium_pct),
          academy_pct: Number(form.academy_pct),
          dark_store_pct: Number(form.dark_store_pct),
          area_sqft: form.area_sqft ? Number(form.area_sqft) : null,
          chairs: Number(form.chairs),
          tables_count: Number(form.tables_count),
          cctv_count: Number(form.cctv_count),
          computer_count: Number(form.computer_count),
          printer_count: Number(form.printer_count),
          // agreement fields
          agreement_version: form.agreement_version ?? null,
          agreement_date: form.agreement_date ?? null,
          agreement_expiry: form.agreement_expiry ?? null,
          franchise_type: form.franchise_type ?? "city",
          mg_percent: Number(form.mg_percent ?? 3),
          tns_percent: Number(form.tns_percent ?? 10),
          academy_percent: Number(form.academy_percent ?? 10),
          mall_percent: Number(form.mall_percent ?? 3),
          royalty_percent: Number(form.royalty_percent ?? 5),
          franchise_commission_amount: Number(form.franchise_commission_amount ?? 46500),
        } as any)
        .eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Franchisee updated");
      qc.invalidateQueries({ queryKey: ["franchisees"] });
      qc.invalidateQueries({ queryKey: ["franchisee", franchisee?.id] });
      qc.invalidateQueries({ queryKey: ["fr-dash-record", franchisee?.id] });
      qc.invalidateQueries({ queryKey: ["monthly-roi", franchisee?.id] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const onReset = async () => {
    if (!form) return;
    setResetting(true);
    try {
      const res = (await resetFn({ data: { franchisee_id: form.id } })) as { password: string };
      setNewPassword(res.password);
      toast.success("Password reset");
    } catch (e: any) {
      toast.error(e.message ?? "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  };

  if (!form) return null;

  const monthlyMG =
    (Number(form.investment_amount ?? form.franchise_fee) * Number(form.mg_percent ?? 3)) / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Edit {form.full_name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="partner" className="mt-2">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="partner">Partner</TabsTrigger>
            <TabsTrigger value="agreement">Agreement</TabsTrigger>
            <TabsTrigger value="roi">Legacy ROI</TabsTrigger>
            <TabsTrigger value="premises">Premises</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
          </TabsList>

          <TabsContent value="partner" className="mt-4 space-y-3">
            <div>
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Franchise type</Label>
              <Select
                value={form.franchise_type ?? "city"}
                onValueChange={(v) => setForm({ ...form, franchise_type: v as any })}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="master">Master</SelectItem>
                  <SelectItem value="state">State</SelectItem>
                  <SelectItem value="city">City</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={3} />
            </div>
          </TabsContent>

          <TabsContent value="agreement" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Franchise fee</Label>
                <Select
                  value={feePreset}
                  onValueChange={(v) => {
                    setFeePreset(v);
                    if (v !== "custom") {
                      const n = Number(v);
                      setForm({ ...form, franchise_fee: n, investment_amount: n });
                    }
                  }}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="500000">₹5,00,000</SelectItem>
                    <SelectItem value="1000000">₹10,00,000</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Custom fee (₹)</Label>
                <Input
                  type="number"
                  value={form.franchise_fee}
                  disabled={feePreset !== "custom"}
                  onChange={(e) =>
                    setForm({ ...form, franchise_fee: Number(e.target.value), investment_amount: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Agreement version</Label>
                <Input value={form.agreement_version ?? ""} onChange={(e) => setForm({ ...form, agreement_version: e.target.value })} className="mt-1" placeholder="v1.0" />
              </div>
              <div>
                <Label>Agreement date</Label>
                <Input type="date" value={form.agreement_date ?? ""} onChange={(e) => setForm({ ...form, agreement_date: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Expiry</Label>
                <Input type="date" value={form.agreement_expiry ?? ""} onChange={(e) => setForm({ ...form, agreement_expiry: e.target.value })} className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <PctField label="MG %" value={form.mg_percent ?? 3} onChange={(v) => setForm({ ...form, mg_percent: v })} />
              <PctField label="TNS %" value={form.tns_percent ?? 10} onChange={(v) => setForm({ ...form, tns_percent: v })} />
              <PctField label="Academy %" value={form.academy_percent ?? 10} onChange={(v) => setForm({ ...form, academy_percent: v })} />
              <PctField label="Mall of Salon %" value={form.mall_percent ?? 3} onChange={(v) => setForm({ ...form, mall_percent: v })} />
              <PctField label="Royalty %" value={form.royalty_percent ?? 5} onChange={(v) => setForm({ ...form, royalty_percent: v })} />
              <div>
                <Label>Franchise commission (₹)</Label>
                <Input
                  type="number"
                  value={form.franchise_commission_amount ?? 46500}
                  onChange={(e) => setForm({ ...form, franchise_commission_amount: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="rounded-xl border border-gold/30 bg-gold/5 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Live monthly MG (Investment × MG%)</div>
              <div className="mt-1 font-display text-2xl text-gradient-gold">{formatINR(monthlyMG)}</div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatINR(Number(form.investment_amount ?? form.franchise_fee))} × {Number(form.mg_percent ?? 3)}% ÷ 12
              </p>
            </div>
          </TabsContent>

          <TabsContent value="roi" className="mt-4 space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Legacy percentages retained for existing dashboards. New ROI engine uses the Agreement tab.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <PctField label="Base monthly ROI %" value={Number(form.base_roi_pct)} onChange={(v) => setForm({ ...form, base_roi_pct: v })} />
              <PctField label="Nail Emporium %" value={Number(form.emporium_pct)} onChange={(v) => setForm({ ...form, emporium_pct: v })} />
              <PctField label="Academy % (legacy)" value={Number(form.academy_pct)} onChange={(v) => setForm({ ...form, academy_pct: v })} />
              <PctField label="Dark store %" value={Number(form.dark_store_pct)} onChange={(v) => setForm({ ...form, dark_store_pct: v })} />
            </div>
          </TabsContent>

          <TabsContent value="premises" className="mt-4 space-y-3">
            <div>
              <Label>Area (sq ft)</Label>
              <Input type="number" value={form.area_sqft ?? 0} onChange={(e) => setForm({ ...form, area_sqft: Number(e.target.value) })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <NumField label="Chairs" value={form.chairs} onChange={(v) => setForm({ ...form, chairs: v })} />
              <NumField label="Tables" value={form.tables_count} onChange={(v) => setForm({ ...form, tables_count: v })} />
              <NumField label="CCTV" value={form.cctv_count} onChange={(v) => setForm({ ...form, cctv_count: v })} />
              <NumField label="Computer" value={form.computer_count} onChange={(v) => setForm({ ...form, computer_count: v })} />
              <NumField label="Printer" value={form.printer_count} onChange={(v) => setForm({ ...form, printer_count: v })} />
            </div>
          </TabsContent>

          <TabsContent value="access" className="mt-4 space-y-3">
            <div>
              <Label>Login email</Label>
              <Input value={form.email ?? "—"} readOnly className="mt-1 bg-background/40" />
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-sm font-medium">Reset password</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Generates a new temporary password and replaces the existing one. Share it once with the partner.
              </p>
              <Button onClick={onReset} disabled={resetting || !form.user_id} className="mt-3" variant="outline">
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
                {resetting ? "Resetting…" : "Reset password"}
              </Button>
              {!form.user_id && (
                <p className="mt-2 text-xs text-amber-400">No login account linked yet. Use the onboarding wizard to create one first.</p>
              )}
              {newPassword && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-500/10 p-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-300">New temporary password</div>
                    <div className="mt-1 font-mono text-sm">{newPassword}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => copy(newPassword, "Password")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-gradient-gold text-background" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PctField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1" />
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1" />
    </div>
  );
}
