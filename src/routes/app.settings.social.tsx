import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  Youtube,
  MessageCircle,
  Webhook,
  Copy,
  RefreshCcw,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/settings/social")({
  head: () => ({ meta: [{ title: "Social & Integrations — MMA Suite" }] }),
  component: SocialSettings,
});

function generateSecret(): string {
  const arr = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function SocialSettings() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("org_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: events } = useQuery({
    queryKey: ["social-lead-events"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("social_lead_events")
        .select("id, source, campaign, status, signature_valid, error_message, lead_id, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const [facebook, setFacebook] = React.useState("");
  const [instagram, setInstagram] = React.useState("");
  const [youtube, setYoutube] = React.useState("");
  const [linkedin, setLinkedin] = React.useState("");
  const [twitter, setTwitter] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [showSecret, setShowSecret] = React.useState(false);

  React.useEffect(() => {
    if (!org) return;
    setFacebook(org.facebook_url ?? "");
    setInstagram(org.instagram_url ?? "");
    setYoutube(org.youtube_url ?? "");
    setLinkedin(org.linkedin_url ?? "");
    setTwitter(org.twitter_url ?? "");
    setWhatsapp(org.whatsapp_number ?? "");
    setSecret(org.lead_webhook_secret ?? "");
  }, [org]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("org_settings")
        .update({
          facebook_url: facebook.trim() || null,
          instagram_url: instagram.trim() || null,
          youtube_url: youtube.trim() || null,
          linkedin_url: linkedin.trim() || null,
          twitter_url: twitter.trim() || null,
          whatsapp_number: whatsapp.trim() || null,
          lead_webhook_secret: secret.trim() || null,
        })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Social settings saved");
      qc.invalidateQueries({ queryKey: ["org-settings"] });
      qc.invalidateQueries({ queryKey: ["org-settings-public"] });
    },
    onError: (e: any) => {
      console.error(e);
      toast.error(e?.message ?? "Failed to save");
    },
  });

  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/public/social-lead-hook` : "/api/public/social-lead-hook";

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-2xl glass p-6 text-sm text-muted-foreground">
        You do not have permission to manage social integrations.
      </div>
    );
  }

  if (isLoading) {
    return <div className="rounded-2xl glass p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const SOCIALS: Array<{ icon: typeof Facebook; label: string; placeholder: string; value: string; setter: (v: string) => void }> = [
    { icon: Facebook, label: "Facebook page URL", placeholder: "https://facebook.com/yourpage", value: facebook, setter: setFacebook },
    { icon: Instagram, label: "Instagram URL", placeholder: "https://instagram.com/yourhandle", value: instagram, setter: setInstagram },
    { icon: Youtube, label: "YouTube channel URL", placeholder: "https://youtube.com/@yourchannel", value: youtube, setter: setYoutube },
    { icon: Linkedin, label: "LinkedIn page URL", placeholder: "https://linkedin.com/company/yourcompany", value: linkedin, setter: setLinkedin },
    { icon: Twitter, label: "X / Twitter URL", placeholder: "https://x.com/yourhandle", value: twitter, setter: setTwitter },
    { icon: MessageCircle, label: "WhatsApp number (with country code)", placeholder: "+91 98765 43210", value: whatsapp, setter: setWhatsapp },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl glass p-6">
        <h2 className="font-display text-xl">Public social profiles</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These URLs power the icons in your marketing footer and shareable pages.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {SOCIALS.map((s) => (
            <div key={s.label}>
              <Label className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </Label>
              <Input
                value={s.value}
                onChange={(e) => s.setter(e.target.value)}
                placeholder={s.placeholder}
                className="mt-1.5"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl glass p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-gold" />
              <h2 className="font-display text-xl">Lead-capture webhook</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Forward Meta Lead Ads, Google Ads, or any landing-page form to this URL via Zapier / Pabbly /
              Make. Verified leads land directly in your CRM with UTM tracking and dedup.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Webhook URL</Label>
            <div className="mt-1.5 flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(webhookUrl, "URL")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Signing secret</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                type={showSecret ? "text" : "password"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Click 'Generate' to create one"
                className="font-mono text-xs"
              />
              <Button variant="outline" size="icon" onClick={() => setShowSecret((v) => !v)} title={showSecret ? "Hide" : "Show"}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={() => copy(secret, "Secret")} disabled={!secret}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setSecret(generateSecret())} title="Generate new">
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Send it as <code className="rounded bg-muted px-1">x-lovable-signature</code> (HMAC-SHA256 hex of body) or
              as <code className="rounded bg-muted px-1">?secret=…</code> query for tools that can't sign.
            </p>
          </div>

          <details className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs">
            <summary className="cursor-pointer font-medium text-foreground">Expected JSON payload</summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
{`POST ${webhookUrl}?secret=YOUR_SECRET
Content-Type: application/json

{
  "source": "meta",            // meta | google | zapier | pabbly | make | other
  "campaign": "Diwali_Franchise_2026",
  "full_name": "Rahul Mehta",
  "email": "rahul@example.com",
  "phone": "+919876543210",
  "city": "Mumbai",
  "budget": 500000,
  "notes": "Interested in dark store franchise",
  "utm": {
    "source": "facebook",
    "medium": "cpc",
    "campaign": "Diwali_Franchise_2026"
  }
}`}
            </pre>
          </details>
        </div>
      </div>

      <div className="rounded-2xl glass p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Recent webhook events</h2>
          <Badge variant="outline" className="text-xs">Last 20</Badge>
        </div>
        <Separator className="my-4" />
        {!events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No events yet. Once you wire up your ads or test endpoint, deliveries will appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => {
              const ok = e.status === "created" || e.status === "dedup";
              const Icon = ok ? CheckCircle2 : e.status === "rejected" ? XCircle : AlertCircle;
              const tone =
                e.status === "created"
                  ? "text-emerald-500"
                  : e.status === "dedup"
                  ? "text-sky-500"
                  : e.status === "rejected"
                  ? "text-red-500"
                  : "text-amber-500";
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/30 px-3 py-2 text-sm">
                  <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Badge variant="outline" className="capitalize">{e.source}</Badge>
                    <span className="capitalize text-muted-foreground">{e.status}</span>
                    {e.campaign && <span className="truncate text-xs text-muted-foreground">· {e.campaign}</span>}
                    {e.error_message && <span className="truncate text-xs text-red-400">· {e.error_message}</span>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(e.created_at), "MMM d, HH:mm")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-gradient-gold text-background">
          Save all settings
        </Button>
      </div>
    </div>
  );
}
