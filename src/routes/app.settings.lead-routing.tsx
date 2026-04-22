import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus,
  Trash2,
  Pencil,
  GitBranch,
  CheckCircle2,
  XCircle,
  ArrowUp,
  ArrowDown,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/settings/lead-routing")({
  head: () => ({ meta: [{ title: "Lead Routing — MMA Suite" }] }),
  component: LeadRoutingPage,
});

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  match_source: string | null;
  match_campaign: string | null;
  match_utm_source: string | null;
  match_utm_medium: string | null;
  match_utm_campaign: string | null;
  match_city: string | null;
  match_state: string | null;
  assign_to_user: string | null;
  assign_territory_id: string | null;
  assign_franchisee_id: string | null;
  set_stage: string | null;
  add_tag: string | null;
  notes: string | null;
  updated_at: string;
};

type RuleDraft = Omit<Rule, "id" | "updated_at">;

const SOURCES = ["", "meta", "google", "zapier", "pabbly", "make", "manual_test", "other"] as const;
const STAGES = ["", "new", "interested", "followup", "hot", "payment_pending", "closed"] as const;

const blankDraft: RuleDraft = {
  name: "",
  enabled: true,
  priority: 100,
  match_source: null,
  match_campaign: null,
  match_utm_source: null,
  match_utm_medium: null,
  match_utm_campaign: null,
  match_city: null,
  match_state: null,
  assign_to_user: null,
  assign_territory_id: null,
  assign_franchisee_id: null,
  set_stage: null,
  add_tag: null,
  notes: null,
};

function LeadRoutingPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<Rule | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState<RuleDraft>(blankDraft);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["lead-routing-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_routing_rules")
        .select("*")
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const { data: salesUsers } = useQuery({
    queryKey: ["sales-users"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data ?? []).filter((u: { roles: string[] | null }) =>
        (u.roles ?? []).some((r) => ["sales", "super_admin", "founder"].includes(r)),
      );
    },
  });

  const { data: territories } = useQuery({
    queryKey: ["territories"],
    queryFn: async () => {
      const { data } = await supabase.from("territories").select("id, name, state").order("name");
      return data ?? [];
    },
  });

  const { data: franchisees } = useQuery({
    queryKey: ["franchisees-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("franchisees")
        .select("id, full_name, territory_id")
        .eq("status", "active")
        .order("full_name");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...draft,
        name: draft.name.trim(),
        match_source: draft.match_source || null,
        match_campaign: draft.match_campaign?.trim() || null,
        match_utm_source: draft.match_utm_source?.trim() || null,
        match_utm_medium: draft.match_utm_medium?.trim() || null,
        match_utm_campaign: draft.match_utm_campaign?.trim() || null,
        match_city: draft.match_city?.trim() || null,
        match_state: draft.match_state?.trim() || null,
        add_tag: draft.add_tag?.trim() || null,
        notes: draft.notes?.trim() || null,
        set_stage: (draft.set_stage || null) as
          | "new" | "interested" | "followup" | "hot" | "payment_pending" | "closed" | "lost" | null,
      };
      if (!payload.name) throw new Error("Rule name is required");
      if (editing) {
        const { error } = await supabase
          .from("lead_routing_rules")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lead_routing_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Rule updated" : "Rule created");
      qc.invalidateQueries({ queryKey: ["lead-routing-rules"] });
      setCreating(false);
      setEditing(null);
      setDraft(blankDraft);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("lead_routing_rules")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-routing-rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: number }) => {
      const { error } = await supabase
        .from("lead_routing_rules")
        .update({ priority })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-routing-rules"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_routing_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule deleted");
      qc.invalidateQueries({ queryKey: ["lead-routing-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setDraft({ ...blankDraft, priority: (rules?.length ?? 0) * 10 + 10 });
    setCreating(true);
  };

  const openEdit = (rule: Rule) => {
    setEditing(rule);
    setDraft({
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      match_source: rule.match_source,
      match_campaign: rule.match_campaign,
      match_utm_source: rule.match_utm_source,
      match_utm_medium: rule.match_utm_medium,
      match_utm_campaign: rule.match_utm_campaign,
      match_city: rule.match_city,
      match_state: rule.match_state,
      assign_to_user: rule.assign_to_user,
      assign_territory_id: rule.assign_territory_id,
      assign_franchisee_id: rule.assign_franchisee_id,
      set_stage: rule.set_stage,
      add_tag: rule.add_tag,
      notes: rule.notes,
    });
    setCreating(true);
  };

  if (!isAdmin) {
    return (
      <div className="rounded-2xl glass p-6 text-sm text-muted-foreground">
        You do not have permission to manage lead routing rules.
      </div>
    );
  }

  const userById = new Map(
    (salesUsers ?? []).map((u: { id: string; full_name: string | null; email: string | null }) => [
      u.id,
      u.full_name ?? u.email ?? "Unknown",
    ]),
  );
  const territoryById = new Map((territories ?? []).map((t) => [t.id, `${t.name} (${t.state})`]));
  const franchiseeById = new Map((franchisees ?? []).map((f) => [f.id, f.full_name]));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl glass p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-gold" />
              <h2 className="font-display text-xl">Lead routing rules</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              When a new social lead arrives via the webhook, rules are evaluated in priority order
              (lowest first). The first matching rule decides who owns the lead, which territory it
              belongs to, and which franchisee gets notified.
            </p>
          </div>
          <Button onClick={openCreate} className="bg-gradient-gold text-background">
            <Plus className="mr-2 h-4 w-4" />
            New rule
          </Button>
        </div>

        <Separator className="my-5" />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading rules…</p>
        ) : !rules || rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/30 px-6 py-10 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-gold" />
            <p className="mt-3 text-sm text-muted-foreground">
              No routing rules yet. Create your first rule to start auto-assigning incoming leads.
            </p>
            <Button onClick={openCreate} variant="outline" className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create rule
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule, idx) => {
              const conditions: string[] = [];
              if (rule.match_source) conditions.push(`source=${rule.match_source}`);
              if (rule.match_campaign) conditions.push(`campaign~${rule.match_campaign}`);
              if (rule.match_utm_source) conditions.push(`utm_source~${rule.match_utm_source}`);
              if (rule.match_utm_medium) conditions.push(`utm_medium~${rule.match_utm_medium}`);
              if (rule.match_utm_campaign) conditions.push(`utm_campaign~${rule.match_utm_campaign}`);
              if (rule.match_city) conditions.push(`city~${rule.match_city}`);
              if (rule.match_state) conditions.push(`state=${rule.match_state}`);

              const actions: string[] = [];
              if (rule.assign_to_user) actions.push(`→ ${userById.get(rule.assign_to_user) ?? "user"}`);
              if (rule.assign_territory_id)
                actions.push(`territory: ${territoryById.get(rule.assign_territory_id) ?? "—"}`);
              if (rule.assign_franchisee_id)
                actions.push(`franchisee: ${franchiseeById.get(rule.assign_franchisee_id) ?? "—"}`);
              if (rule.set_stage) actions.push(`stage=${rule.set_stage}`);
              if (rule.add_tag) actions.push(`tag=${rule.add_tag}`);

              return (
                <div
                  key={rule.id}
                  className="rounded-xl border border-border/40 bg-background/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          #{rule.priority}
                        </Badge>
                        <h3 className="truncate font-medium">{rule.name}</h3>
                        {rule.enabled ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        <span className="text-muted-foreground">When:</span>
                        {conditions.length === 0 ? (
                          <span className="italic text-muted-foreground">any lead</span>
                        ) : (
                          conditions.map((c) => (
                            <code key={c} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                              {c}
                            </code>
                          ))
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                        <span className="text-muted-foreground">Then:</span>
                        {actions.length === 0 ? (
                          <span className="italic text-muted-foreground">no assignment</span>
                        ) : (
                          actions.map((a) => (
                            <code key={a} className="rounded bg-gold/10 px-1.5 py-0.5 text-[11px] text-gold">
                              {a}
                            </code>
                          ))
                        )}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Updated {format(new Date(rule.updated_at), "MMM d, HH:mm")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Move up"
                        disabled={idx === 0}
                        onClick={() => {
                          const prev = rules[idx - 1];
                          reorder.mutate({ id: rule.id, priority: prev.priority - 1 });
                        }}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Move down"
                        disabled={idx === rules.length - 1}
                        onClick={() => {
                          const next = rules[idx + 1];
                          reorder.mutate({ id: rule.id, priority: next.priority + 1 });
                        }}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(v) => toggle.mutate({ id: rule.id, enabled: v })}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete rule "${rule.name}"?`)) remove.mutate(rule.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={(v) => { setCreating(v); if (!v) { setEditing(null); setDraft(blankDraft); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit routing rule" : "New routing rule"}</DialogTitle>
            <DialogDescription>
              Leave a condition empty to act as a wildcard. All non-empty conditions must match.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-3 md:grid-cols-[1fr_120px]">
              <div>
                <Label>Rule name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Diwali Mumbai → Rahul"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Priority</Label>
                <Input
                  type="number"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                When a lead matches…
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Source</Label>
                  <Select
                    value={draft.match_source ?? ""}
                    onValueChange={(v) => setDraft({ ...draft, match_source: v || null })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Any source" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s || "any"} value={s || "__any__"}>
                          {s || "Any source"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Campaign contains</Label>
                  <Input
                    value={draft.match_campaign ?? ""}
                    onChange={(e) => setDraft({ ...draft, match_campaign: e.target.value || null })}
                    placeholder="Diwali_Franchise"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">UTM source contains</Label>
                  <Input
                    value={draft.match_utm_source ?? ""}
                    onChange={(e) => setDraft({ ...draft, match_utm_source: e.target.value || null })}
                    placeholder="facebook"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">UTM medium contains</Label>
                  <Input
                    value={draft.match_utm_medium ?? ""}
                    onChange={(e) => setDraft({ ...draft, match_utm_medium: e.target.value || null })}
                    placeholder="cpc"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">UTM campaign contains</Label>
                  <Input
                    value={draft.match_utm_campaign ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, match_utm_campaign: e.target.value || null })
                    }
                    placeholder="winter_2026"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">City contains</Label>
                  <Input
                    value={draft.match_city ?? ""}
                    onChange={(e) => setDraft({ ...draft, match_city: e.target.value || null })}
                    placeholder="Mumbai"
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                …then assign it to
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Sales rep / owner</Label>
                  <Select
                    value={draft.assign_to_user ?? ""}
                    onValueChange={(v) =>
                      setDraft({ ...draft, assign_to_user: v === "__none__" ? null : v })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {(salesUsers ?? []).map((u: { id: string; full_name: string | null; email: string | null }) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name ?? u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Territory</Label>
                  <Select
                    value={draft.assign_territory_id ?? ""}
                    onValueChange={(v) =>
                      setDraft({ ...draft, assign_territory_id: v === "__none__" ? null : v })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="No territory" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No territory</SelectItem>
                      {(territories ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.state})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Franchisee</Label>
                  <Select
                    value={draft.assign_franchisee_id ?? ""}
                    onValueChange={(v) =>
                      setDraft({ ...draft, assign_franchisee_id: v === "__none__" ? null : v })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="No franchisee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No franchisee</SelectItem>
                      {(franchisees ?? []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Initial stage</Label>
                  <Select
                    value={draft.set_stage ?? ""}
                    onValueChange={(v) => setDraft({ ...draft, set_stage: v === "__default__" ? null : v })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Default (new)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Default (new)</SelectItem>
                      {STAGES.filter(Boolean).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Tag (added to lead notes)</Label>
                  <Input
                    value={draft.add_tag ?? ""}
                    onChange={(e) => setDraft({ ...draft, add_tag: e.target.value || null })}
                    placeholder="hot-mumbai"
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 px-3 py-2">
              <Label htmlFor="enabled" className="text-sm">Rule enabled</Label>
              <Switch
                id="enabled"
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCreating(false); setEditing(null); setDraft(blankDraft); }}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="bg-gradient-gold text-background"
            >
              {editing ? "Save changes" : "Create rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
