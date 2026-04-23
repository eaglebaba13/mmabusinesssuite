import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Search, Building2, Copy, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { formatINRCompact } from "@/lib/format";
import { format } from "date-fns";
import { ExportBar } from "@/components/app/ExportBar";
import { defaultDateRange, exportToCSV, exportToPDF, inDateRange } from "@/lib/export";
import { createFranchiseeUser } from "@/server/franchisee-user.functions";
import { FranchiseeActions } from "@/components/app/FranchiseeActions";
import { ImportButton } from "@/components/app/ImportButton";

export const Route = createFileRoute("/app/franchisees")({
  head: () => ({ meta: [{ title: "Franchisees — MMA Suite" }] }),
  component: FranchiseesPage,
});

type Step = 1 | 2 | 3 | 4 | 5;

interface OnboardForm {
  full_name: string;
  email: string;
  phone: string;
  investment_amount: string;
  franchise_fee: string;
  base_roi_pct: string;
  emporium_pct: string;
  academy_pct: string;
  dark_store_pct: string;
  area_sqft: string;
  chairs: string;
  tables_count: string;
  cctv_count: string;
  computer_count: string;
  printer_count: string;
}

const emptyForm: OnboardForm = {
  full_name: "",
  email: "",
  phone: "",
  investment_amount: "500000",
  franchise_fee: "500000",
  base_roi_pct: "3",
  emporium_pct: "10",
  academy_pct: "3",
  dark_store_pct: "3",
  area_sqft: "150",
  chairs: "2",
  tables_count: "1",
  cctv_count: "1",
  computer_count: "1",
  printer_count: "1",
};

function genPassword(length = 12) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
  let pw = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) pw += chars[arr[i] % chars.length];
  return pw;
}

function FranchiseesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>(1);
  const [form, setForm] = React.useState<OnboardForm>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [creds, setCreds] = React.useState<{ email: string; password: string } | null>(null);
  const [range, setRange] = React.useState(defaultDateRange());
  const createUserFn = useServerFn(createFranchiseeUser);

  const { data: franchisees = [] } = useQuery({
    queryKey: ["franchisees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("franchisees").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = (franchisees ?? []).filter((f) =>
    (f.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (f.email ?? "").toLowerCase().includes(search.toLowerCase())) &&
    inDateRange(f.joined_at ?? f.created_at, range.from, range.to),
  );

  const exportCols = [
    { header: "Name", accessor: (f: any) => f.full_name },
    { header: "Email", accessor: (f: any) => f.email ?? "" },
    { header: "Phone", accessor: (f: any) => f.phone ?? "" },
    { header: "Status", accessor: (f: any) => f.status },
    { header: "Investment", accessor: (f: any) => Number(f.investment_amount ?? 0) },
    { header: "Joined", accessor: (f: any) => f.joined_at ?? "" },
  ];
  const fileBase = `franchisees_${range.from}_to_${range.to}`;
  const onCSV = () => exportToCSV(fileBase, filtered, exportCols);
  const onPDF = () =>
    exportToPDF({
      filename: fileBase,
      title: "Franchisees Roster",
      subtitle: `${range.from} → ${range.to}`,
      rows: filtered,
      columns: exportCols,
      totals: [
        { label: "Total franchisees", value: String(filtered.length) },
        { label: "Total invested", value: formatINRCompact(filtered.reduce((s, f) => s + Number(f.investment_amount ?? 0), 0)) },
      ],
    });

  const resetWizard = () => {
    setStep(1);
    setForm(emptyForm);
    setCreatedId(null);
    setCreds(null);
  };

  const closeWizard = () => {
    setOpen(false);
    setTimeout(resetWizard, 300);
  };

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("franchisees")
        .insert({
          full_name: form.full_name,
          email: form.email || null,
          phone: form.phone || null,
          investment_amount: Number(form.investment_amount),
          franchise_fee: Number(form.franchise_fee),
          base_roi_pct: Number(form.base_roi_pct),
          emporium_pct: Number(form.emporium_pct),
          academy_pct: Number(form.academy_pct),
          dark_store_pct: Number(form.dark_store_pct),
          area_sqft: Number(form.area_sqft),
          chairs: Number(form.chairs),
          tables_count: Number(form.tables_count),
          cctv_count: Number(form.cctv_count),
          computer_count: Number(form.computer_count),
          printer_count: Number(form.printer_count),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setCreatedId(data.id);
      toast.success("Franchisee profile saved");
      setStep(4);
      qc.invalidateQueries({ queryKey: ["franchisees"] });
    },
    onError: (e: any) => {
      console.error(e);
      toast.error(e.message || "An error occurred. Please try again.");
    },
  });

  const generateLogin = async () => {
    if (!createdId) return;
    setSaving(true);
    try {
      const safeName = (form.full_name || "partner").toLowerCase().replace(/[^a-z0-9]/g, "");
      const phoneTail = (form.phone || Math.random().toString().slice(2, 7)).replace(/\D/g, "").slice(-5);
      const loginEmail = form.email || `${safeName}.${phoneTail}@franchisee.mma`;
      const password = genPassword(12);
      await createUserFn({
        data: {
          franchisee_id: createdId,
          email: loginEmail,
          password,
          full_name: form.full_name,
        },
      });
      setCreds({ email: loginEmail, password });
      setStep(5);
      toast.success("Login created");
      qc.invalidateQueries({ queryKey: ["franchisees"] });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to create login");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (txt: string, what: string) => {
    await navigator.clipboard.writeText(txt);
    toast.success(`${what} copied`);
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Franchise Network</p>
          <h1 className="mt-1 font-display text-3xl">Franchisees</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-[260px] bg-card/40 pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <ImportButton configKey="franchisees" />
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTimeout(resetWizard, 300); }}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />Onboard</Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl bg-card">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Onboard franchisee</DialogTitle>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <StepDot active={step >= 1} done={step > 1} label="Partner" />
                  <StepLine />
                  <StepDot active={step >= 2} done={step > 2} label="ROI" />
                  <StepLine />
                  <StepDot active={step >= 3} done={step > 3} label="Premises" />
                  <StepLine />
                  <StepDot active={step >= 4} done={step > 4} label="Login" />
                </div>
              </DialogHeader>

              {step === 1 && (
                <div className="space-y-3">
                  <div><Label>Full name *</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
                    <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
                  </div>
                  <p className="text-xs text-muted-foreground">If email is left blank, we'll auto-generate one for the login.</p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Franchise fee (₹)</Label><Input type="number" value={form.franchise_fee} onChange={(e) => setForm({ ...form, franchise_fee: e.target.value, investment_amount: e.target.value })} className="mt-1" /></div>
                    <div><Label>Base monthly ROI %</Label><Input type="number" step="0.01" value={form.base_roi_pct} onChange={(e) => setForm({ ...form, base_roi_pct: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Emporium %</Label><Input type="number" step="0.01" value={form.emporium_pct} onChange={(e) => setForm({ ...form, emporium_pct: e.target.value })} className="mt-1" /></div>
                    <div><Label>Academy %</Label><Input type="number" step="0.01" value={form.academy_pct} onChange={(e) => setForm({ ...form, academy_pct: e.target.value })} className="mt-1" /></div>
                    <div><Label>Dark store %</Label><Input type="number" step="0.01" value={form.dark_store_pct} onChange={(e) => setForm({ ...form, dark_store_pct: e.target.value })} className="mt-1" /></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Defaults: ₹5L fee · 3% fixed ROI · 10% Emporium · 3% Academy · 3% Dark store.</p>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <div><Label>Area (sq ft, min 150)</Label><Input type="number" value={form.area_sqft} onChange={(e) => setForm({ ...form, area_sqft: e.target.value })} className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div><Label>Chairs</Label><Input type="number" value={form.chairs} onChange={(e) => setForm({ ...form, chairs: e.target.value })} className="mt-1" /></div>
                    <div><Label>Tables</Label><Input type="number" value={form.tables_count} onChange={(e) => setForm({ ...form, tables_count: e.target.value })} className="mt-1" /></div>
                    <div><Label>CCTV</Label><Input type="number" value={form.cctv_count} onChange={(e) => setForm({ ...form, cctv_count: e.target.value })} className="mt-1" /></div>
                    <div><Label>Computer</Label><Input type="number" value={form.computer_count} onChange={(e) => setForm({ ...form, computer_count: e.target.value })} className="mt-1" /></div>
                    <div><Label>Printer</Label><Input type="number" value={form.printer_count} onChange={(e) => setForm({ ...form, printer_count: e.target.value })} className="mt-1" /></div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
                  <div className="font-display text-xl">Profile saved</div>
                  <p className="text-sm text-muted-foreground">
                    Generate login credentials so {form.full_name} can sign in to their dashboard.
                  </p>
                </div>
              )}

              {step === 5 && creds && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                    <div className="mt-2 font-display text-lg">Login created</div>
                    <p className="mt-1 text-xs text-muted-foreground">Share these credentials with the partner. The password is shown once.</p>
                  </div>
                  <div className="space-y-2">
                    <CredRow label="Login email" value={creds.email} onCopy={() => copy(creds.email, "Email")} />
                    <CredRow label="Temporary password" value={creds.password} onCopy={() => copy(creds.password, "Password")} mono />
                  </div>
                </div>
              )}

              <DialogFooter className="flex flex-row justify-between sm:justify-between">
                {step > 1 && step < 4 && (
                  <Button variant="outline" onClick={() => setStep((s) => (s - 1) as Step)}>Back</Button>
                )}
                <div className="ml-auto flex gap-2">
                  {step < 3 && (
                    <Button
                      className="bg-gradient-gold text-background"
                      disabled={step === 1 && !form.full_name}
                      onClick={() => setStep((s) => (s + 1) as Step)}
                    >
                      Next
                    </Button>
                  )}
                  {step === 3 && (
                    <Button
                      className="bg-gradient-gold text-background"
                      disabled={create.isPending}
                      onClick={() => create.mutate()}
                    >
                      {create.isPending ? "Saving…" : "Save & continue"}
                    </Button>
                  )}
                  {step === 4 && (
                    <>
                      <Button variant="outline" onClick={closeWizard}>Skip</Button>
                      <Button className="bg-gradient-gold text-background" disabled={saving} onClick={generateLogin}>
                        {saving ? "Creating…" : "Generate login"}
                      </Button>
                    </>
                  )}
                  {step === 5 && (
                    <Button className="bg-gradient-gold text-background" onClick={closeWizard}>Done</Button>
                  )}
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>

      <ExportBar
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onCSV={onCSV}
        onPDF={onPDF}
        count={filtered.length}
      />

      <FranchiseeCardGrid franchisees={filtered} />
        {filtered.length === 0 ? null : null}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl glass p-12 text-center text-muted-foreground">No franchisees yet.</div>
        )}
      </div>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-2 w-2 rounded-full ${done ? "bg-emerald-400" : active ? "bg-gold" : "bg-muted"}`} />
      <span className={active ? "text-foreground" : ""}>{label}</span>
    </div>
  );
}
function StepLine() {
  return <div className="h-px w-6 bg-border" />;
}
function CredRow({ label, value, onCopy, mono }: { label: string; value: string; onCopy: () => void; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-background/40 p-3">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-0.5 ${mono ? "font-mono" : ""} text-sm`}>{value}</div>
      </div>
      <Button size="sm" variant="ghost" onClick={onCopy}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
