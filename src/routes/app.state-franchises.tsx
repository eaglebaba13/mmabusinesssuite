import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Search, MapPin, Copy, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { formatINRCompact } from "@/lib/format";
import { format } from "date-fns";
import { createStateFranchiseUser } from "@/server/state-franchise-user.functions";

export const Route = createFileRoute("/app/state-franchises")({
  head: () => ({ meta: [{ title: "State Franchises — MMA Suite" }] }),
  component: StateFranchisesPage,
});

type Step = 1 | 2 | 3 | 4 | 5;

interface Form {
  full_name: string;
  email: string;
  phone: string;
  state: string;
  investment_amount: string;
  state_partner_pct: string;
  territory_ids: string[];
}

const empty: Form = {
  full_name: "",
  email: "",
  phone: "",
  state: "",
  investment_amount: "1000000",
  state_partner_pct: "10",
  territory_ids: [],
};

function genPassword(length = 12) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
  let pw = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) pw += chars[arr[i] % chars.length];
  return pw;
}

function StateFranchisesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>(1);
  const [form, setForm] = React.useState<Form>(empty);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [creds, setCreds] = React.useState<{ email: string; password: string } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const createUserFn = useServerFn(createStateFranchiseUser);

  const { data: rows = [] } = useQuery({
    queryKey: ["state-franchises"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("state_franchises")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: territories = [] } = useQuery({
    queryKey: ["territories-all"],
    queryFn: async () => {
      const { data } = await supabase.from("territories").select("*").order("state", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const { data: cityCounts = {} } = useQuery({
    queryKey: ["state-franchise-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("franchisees").select("id, territory_id");
      const tMap: Record<string, string | null> = {};
      (territories as any[]).forEach((t) => { tMap[t.id] = t.state_franchise_id; });
      const counts: Record<string, number> = {};
      (data ?? []).forEach((f: any) => {
        const sfId = f.territory_id ? tMap[f.territory_id] : null;
        if (sfId) counts[sfId] = (counts[sfId] ?? 0) + 1;
      });
      return counts;
    },
    enabled: territories.length > 0,
  });

  const filtered = rows.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.state ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const reset = () => {
    setStep(1);
    setForm(empty);
    setCreatedId(null);
    setCreds(null);
  };
  const closeWizard = () => {
    setOpen(false);
    setTimeout(reset, 300);
  };

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any)
        .from("state_franchises")
        .insert({
          full_name: form.full_name,
          email: form.email || null,
          phone: form.phone || null,
          state: form.state,
          investment_amount: Number(form.investment_amount),
          state_partner_pct: Number(form.state_partner_pct),
        })
        .select("id")
        .single();
      if (error) throw error;
      // Assign chosen territories
      if (form.territory_ids.length > 0) {
        const { error: tErr } = await (supabase as any)
          .from("territories")
          .update({ state_franchise_id: data.id })
          .in("id", form.territory_ids);
        if (tErr) throw tErr;
      }
      return data;
    },
    onSuccess: (data: any) => {
      setCreatedId(data.id);
      toast.success("State franchise saved");
      setStep(4);
      qc.invalidateQueries({ queryKey: ["state-franchises"] });
      qc.invalidateQueries({ queryKey: ["territories-all"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  const generateLogin = async () => {
    if (!createdId) return;
    setSaving(true);
    try {
      const safe = (form.full_name || "partner").toLowerCase().replace(/[^a-z0-9]/g, "");
      const tail = (form.phone || Math.random().toString().slice(2, 7)).replace(/\D/g, "").slice(-5);
      const loginEmail = form.email || `${safe}.${tail}@state.mma`;
      const password = genPassword(12);
      await createUserFn({
        data: {
          state_franchise_id: createdId,
          email: loginEmail,
          password,
          full_name: form.full_name,
        },
      });
      setCreds({ email: loginEmail, password });
      setStep(5);
      toast.success("Login created");
    } catch (e: any) {
      toast.error(e.message || "Failed to create login");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (txt: string, what: string) => {
    await navigator.clipboard.writeText(txt);
    toast.success(`${what} copied`);
  };

  const unassignedTerritories = (territories as any[]).filter((t) => !t.state_franchise_id);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Network</p>
          <h1 className="mt-1 font-display text-3xl">State Franchises</h1>
          <p className="text-sm text-muted-foreground">State partners who own multiple city territories.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-[260px] bg-card/40 pl-9" />
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTimeout(reset, 300); }}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />Onboard State Franchise</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl bg-card">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Onboard state franchise</DialogTitle>
              </DialogHeader>

              {step === 1 && (
                <div className="space-y-3">
                  <div><Label>Full name *</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
                    <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div><Label>State *</Label><Input required placeholder="e.g. Maharashtra" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="mt-1" /></div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Investment (₹)</Label><Input type="number" value={form.investment_amount} onChange={(e) => setForm({ ...form, investment_amount: e.target.value })} className="mt-1" /></div>
                    <div><Label>State partner % per sale</Label><Input type="number" step="0.01" value={form.state_partner_pct} onChange={(e) => setForm({ ...form, state_partner_pct: e.target.value })} className="mt-1" /></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Default: 10% commission on every city franchisee's sale within their territories.</p>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <Label>Assign unassigned territories</Label>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-border p-3 space-y-2">
                    {unassignedTerritories.length === 0 && (
                      <p className="text-sm text-muted-foreground">No unassigned territories. You can add territories in Settings.</p>
                    )}
                    {unassignedTerritories.map((t: any) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={form.territory_ids.includes(t.id)}
                          onCheckedChange={(v) => {
                            setForm((f) => ({
                              ...f,
                              territory_ids: v
                                ? [...f.territory_ids, t.id]
                                : f.territory_ids.filter((x) => x !== t.id),
                            }));
                          }}
                        />
                        <MapPin className="h-3.5 w-3.5 text-gold" />
                        <span>{t.name}</span>
                        <span className="text-muted-foreground">— {t.state}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
                  <div className="font-display text-xl">Profile saved</div>
                  <p className="text-sm text-muted-foreground">Generate login so {form.full_name} can sign in.</p>
                </div>
              )}

              {step === 5 && creds && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                    <div className="mt-2 font-display text-lg">Login created</div>
                  </div>
                  <CredRow label="Login email" value={creds.email} onCopy={() => copy(creds.email, "Email")} />
                  <CredRow label="Temporary password" value={creds.password} onCopy={() => copy(creds.password, "Password")} mono />
                </div>
              )}

              <DialogFooter className="flex flex-row justify-between sm:justify-between">
                {step > 1 && step < 4 && <Button variant="outline" onClick={() => setStep((s) => (s - 1) as Step)}>Back</Button>}
                <div className="ml-auto flex gap-2">
                  {step < 3 && (
                    <Button className="bg-gradient-gold text-background" disabled={(step === 1 && (!form.full_name || !form.state))} onClick={() => setStep((s) => (s + 1) as Step)}>Next</Button>
                  )}
                  {step === 3 && (
                    <Button className="bg-gradient-gold text-background" disabled={create.isPending} onClick={() => create.mutate()}>
                      {create.isPending ? "Saving…" : "Save & continue"}
                    </Button>
                  )}
                  {step === 4 && (
                    <>
                      <Button variant="outline" onClick={closeWizard}>Skip</Button>
                      <Button className="bg-gradient-gold text-background" disabled={saving} onClick={generateLogin}>{saving ? "Creating…" : "Generate login"}</Button>
                    </>
                  )}
                  {step === 5 && <Button className="bg-gradient-gold text-background" onClick={closeWizard}>Done</Button>}
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r: any) => {
          const cities = (territories as any[]).filter((t) => t.state_franchise_id === r.id).length;
          const fcount = cityCounts[r.id] ?? 0;
          return (
            <div
              key={r.id}
              role="link"
              tabIndex={0}
              onClick={() => navigate({ to: "/app/state-franchises/$stateFranchiseId", params: { stateFranchiseId: r.id } })}
              onKeyDown={(e) => { if (e.key === "Enter") navigate({ to: "/app/state-franchises/$stateFranchiseId", params: { stateFranchiseId: r.id } }); }}
              className="cursor-pointer rounded-2xl glass p-5 hover-gold-glow"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
                  <MapPin className="h-5 w-5 text-background" />
                </div>
                <Badge variant="outline" className="border-gold/40 text-gold capitalize">{r.status}</Badge>
              </div>
              <h3 className="mt-4 font-display text-xl">{r.full_name}</h3>
              <p className="text-xs text-muted-foreground">{r.state}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cities</div>
                  <div className="font-display text-lg text-gradient-gold">{cities}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Franchisees</div>
                  <div className="font-display text-lg text-gradient-gold">{fcount}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Invested</div>
                  <div className="font-display text-sm text-gradient-gold">{formatINRCompact(Number(r.investment_amount))}</div>
                </div>
              </div>
              <div className="mt-3 text-right text-xs text-muted-foreground">Joined {format(new Date(r.joined_at), "MMM yyyy")}</div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl glass p-12 text-center text-muted-foreground">No state franchises yet.</div>
        )}
      </div>
    </div>
  );
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
