import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/settings/")({
  component: SettingsIndex,
});

function SettingsIndex() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: org } = useQuery({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("org_settings").select("*").eq("id", 1).maybeSingle();
      return data;
    },
  });

  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  React.useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  const [orgName, setOrgName] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  React.useEffect(() => {
    if (org) {
      setOrgName(org.org_name ?? "");
      setContactEmail(org.contact_email ?? "");
    }
  }, [org]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: any) => {
      console.error(e);
      toast.error("An error occurred. Please try again.");
    },
  });

  const saveOrg = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("org_settings").update({ org_name: orgName, contact_email: contactEmail }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Workspace saved"),
    onError: (e: any) => {
      console.error(e);
      toast.error("An error occurred. Please try again.");
    },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl glass p-6">
        <h2 className="font-display text-xl">Your profile</h2>
        <div className="mt-4 space-y-3">
          <div><Label>Email</Label><Input value={user?.email ?? ""} disabled className="mt-1" /></div>
          <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" /></div>
          <Button onClick={() => saveProfile.mutate()} className="bg-gradient-gold text-background">Save profile</Button>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-2xl glass p-6">
          <h2 className="font-display text-xl">Workspace</h2>
          <div className="mt-4 space-y-3">
            <div><Label>Organization name</Label><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="mt-1" /></div>
            <div><Label>Contact email</Label><Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1" /></div>
            <Button onClick={() => saveOrg.mutate()} className="bg-gradient-gold text-background">Save workspace</Button>
          </div>
        </div>
      )}

      {isAdmin && <RoiEngineSettings />}
    </div>
  );
}

function RoiEngineSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["org-roi-settings"],
    queryFn: async () => (await supabase.from("org_roi_settings").select("*").maybeSingle()).data,
  });
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase
        .from("org_roi_settings")
        .update({
          default_mg_percent: Number(form.default_mg_percent),
          default_tns_percent: Number(form.default_tns_percent),
          default_academy_percent: Number(form.default_academy_percent),
          default_mall_percent: Number(form.default_mall_percent),
          default_royalty_percent: Number(form.default_royalty_percent),
          default_commission: Number(form.default_commission),
          gst_mode: form.gst_mode,
          calc_method: form.calc_method,
          updated_at: new Date().toISOString(),
        })
        .eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("ROI engine settings saved"); qc.invalidateQueries({ queryKey: ["org-roi-settings"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  if (!form) return null;

  const setNum = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="rounded-2xl glass p-6">
      <h2 className="font-display text-xl">ROI Engine — global defaults</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Applied to new franchisees. Existing franchisees keep their per-agreement overrides.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div><Label>Default MG %</Label><Input type="number" step="0.01" value={form.default_mg_percent} onChange={setNum("default_mg_percent")} className="mt-1" /></div>
        <div><Label>Default TNS %</Label><Input type="number" step="0.01" value={form.default_tns_percent} onChange={setNum("default_tns_percent")} className="mt-1" /></div>
        <div><Label>Default Academy %</Label><Input type="number" step="0.01" value={form.default_academy_percent} onChange={setNum("default_academy_percent")} className="mt-1" /></div>
        <div><Label>Default Mall %</Label><Input type="number" step="0.01" value={form.default_mall_percent} onChange={setNum("default_mall_percent")} className="mt-1" /></div>
        <div><Label>Default Royalty %</Label><Input type="number" step="0.01" value={form.default_royalty_percent} onChange={setNum("default_royalty_percent")} className="mt-1" /></div>
        <div><Label>Default commission (₹)</Label><Input type="number" value={form.default_commission} onChange={setNum("default_commission")} className="mt-1" /></div>
        <div>
          <Label>GST mode</Label>
          <select className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm" value={form.gst_mode} onChange={(e) => setForm({ ...form, gst_mode: e.target.value })}>
            <option value="exclusive">Exclusive</option>
            <option value="inclusive">Inclusive</option>
          </select>
        </div>
        <div>
          <Label>Calculation method</Label>
          <select className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm" value={form.calc_method} onChange={(e) => setForm({ ...form, calc_method: e.target.value })}>
            <option value="max_of_mg_or_variable">MAX(MG, Variable ROI)</option>
          </select>
        </div>
      </div>
      <Button className="mt-4 bg-gradient-gold text-background" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save engine settings"}
      </Button>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Formula: <span className="font-mono">A = TNS × TNS% · B = Academy × Academy% · C = Mall × Mall% · MG = Investment × MG% · Final = MAX(MG, A+B+C)</span>
      </p>
    </div>
  );
}

