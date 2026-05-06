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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resetFranchiseePassword } from "@/server/franchisee-user.functions";

interface Franchisee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  franchise_fee: number;
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
}

interface Props {
  franchisee: Franchisee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FranchiseeEditDialog({ franchisee, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const resetFn = useServerFn(resetFranchiseePassword);
  const [form, setForm] = React.useState<Franchisee | null>(franchisee);
  const [newPassword, setNewPassword] = React.useState<string | null>(null);
  const [resetting, setResetting] = React.useState(false);

  React.useEffect(() => {
    setForm(franchisee);
    setNewPassword(null);
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
        })
        .eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Franchisee updated");
      qc.invalidateQueries({ queryKey: ["franchisees"] });
      qc.invalidateQueries({ queryKey: ["franchisee", franchisee?.id] });
      qc.invalidateQueries({ queryKey: ["fr-dash-record", franchisee?.id] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const onReset = async () => {
    if (!form) return;
    setResetting(true);
    try {
      const res = (await resetFn({ data: { franchisee_id: form.id } })) as {
        password: string;
      };
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Edit {form.full_name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="partner" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="partner">Partner</TabsTrigger>
            <TabsTrigger value="roi">ROI</TabsTrigger>
            <TabsTrigger value="premises">Premises</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
          </TabsList>

          <TabsContent value="partner" className="mt-4 space-y-3">
            <div>
              <Label>Full name</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1"
                rows={3}
              />
            </div>
          </TabsContent>

          <TabsContent value="roi" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Franchise fee (₹)</Label>
                <Input
                  type="number"
                  value={form.franchise_fee}
                  onChange={(e) =>
                    setForm({ ...form, franchise_fee: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Base monthly ROI %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.base_roi_pct}
                  onChange={(e) =>
                    setForm({ ...form, base_roi_pct: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Nail Emporium %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.emporium_pct}
                  onChange={(e) =>
                    setForm({ ...form, emporium_pct: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Academy %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.academy_pct}
                  onChange={(e) =>
                    setForm({ ...form, academy_pct: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Dark store %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.dark_store_pct}
                  onChange={(e) =>
                    setForm({ ...form, dark_store_pct: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Set any percentage to 0 to hide that block on the franchisee dashboard.
            </p>
          </TabsContent>

          <TabsContent value="premises" className="mt-4 space-y-3">
            <div>
              <Label>Area (sq ft)</Label>
              <Input
                type="number"
                value={form.area_sqft ?? 0}
                onChange={(e) =>
                  setForm({ ...form, area_sqft: Number(e.target.value) })
                }
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <Label>Chairs</Label>
                <Input
                  type="number"
                  value={form.chairs}
                  onChange={(e) =>
                    setForm({ ...form, chairs: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Tables</Label>
                <Input
                  type="number"
                  value={form.tables_count}
                  onChange={(e) =>
                    setForm({ ...form, tables_count: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>CCTV</Label>
                <Input
                  type="number"
                  value={form.cctv_count}
                  onChange={(e) =>
                    setForm({ ...form, cctv_count: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Computer</Label>
                <Input
                  type="number"
                  value={form.computer_count}
                  onChange={(e) =>
                    setForm({ ...form, computer_count: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Printer</Label>
                <Input
                  type="number"
                  value={form.printer_count}
                  onChange={(e) =>
                    setForm({ ...form, printer_count: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
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
              <Button
                onClick={onReset}
                disabled={resetting || !form.user_id}
                className="mt-3"
                variant="outline"
              >
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
                {resetting ? "Resetting…" : "Reset password"}
              </Button>
              {!form.user_id && (
                <p className="mt-2 text-xs text-amber-400">
                  No login account linked yet. Use the onboarding wizard to create one first.
                </p>
              )}
              {newPassword && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-500/10 p-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-300">
                      New temporary password
                    </div>
                    <div className="mt-1 font-mono text-sm">{newPassword}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(newPassword, "Password")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-gradient-gold text-background"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
