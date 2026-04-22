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
    </div>
  );
}
