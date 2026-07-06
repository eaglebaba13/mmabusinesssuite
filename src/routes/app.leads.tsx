import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, LayoutGrid, List, Search, Sparkles } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINRCompact } from "@/lib/format";
import { ExportBar } from "@/components/app/ExportBar";
import { ImportButton } from "@/components/app/ImportButton";
import { defaultDateRange, exportToCSV, exportToPDF, inDateRange } from "@/lib/export";

export const Route = createFileRoute("/app/leads")({
  head: () => ({ meta: [{ title: "Leads — MMA Suite" }] }),
  component: LeadsPage,
});

const STAGES = [
  { id: "new", label: "New" },
  { id: "interested", label: "Interested" },
  { id: "followup", label: "Follow-up" },
  { id: "hot", label: "Hot" },
  { id: "payment_pending", label: "Payment Pending" },
  { id: "closed", label: "Closed" },
  { id: "lost", label: "Lost" },
] as const;

type StageId = (typeof STAGES)[number]["id"];

interface Lead {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  source: string;
  stage: StageId;
  score: number | null;
  budget: number | null;
  ad_name: string | null;
  created_at: string;
}

function LeadsPage() {
  const qc = useQueryClient();
  const [view, setView] = React.useState<"kanban" | "table">("kanban");
  const [search, setSearch] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [range, setRange] = React.useState(defaultDateRange());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: StageId }) => {
      const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead moved");
    },
    onError: (e: any) => {
      console.error(e);
      toast.error("An error occurred. Please try again.");
    },
  });

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        (!q ||
          l.full_name.toLowerCase().includes(q) ||
          (l.email ?? "").toLowerCase().includes(q) ||
          (l.phone ?? "").includes(q) ||
          (l.ad_name ?? "").toLowerCase().includes(q)) &&
        inDateRange(l.created_at, range.from, range.to),
    );
  }, [leads, search, range]);

  const exportCols = [
    { header: "Name", accessor: (l: Lead) => l.full_name },
    { header: "Email", accessor: (l: Lead) => l.email ?? "" },
    { header: "Phone", accessor: (l: Lead) => l.phone ?? "" },
    { header: "City", accessor: (l: Lead) => l.city ?? "" },
    { header: "Source", accessor: (l: Lead) => l.source },
    { header: "Ad Name", accessor: (l: Lead) => l.ad_name ?? "" },
    { header: "Stage", accessor: (l: Lead) => l.stage.replace("_", " ") },
    { header: "Budget", accessor: (l: Lead) => (l.budget ? Number(l.budget) : "") },
    { header: "Score", accessor: (l: Lead) => l.score ?? "" },
    { header: "Created", accessor: (l: Lead) => l.created_at?.slice(0, 10) ?? "" },
  ];
  const fileBase = `leads_${range.from}_to_${range.to}`;
  const onCSV = () => exportToCSV(fileBase, filtered, exportCols);
  const onPDF = () =>
    exportToPDF({
      filename: fileBase,
      title: "Leads Pipeline",
      subtitle: `${range.from} → ${range.to}`,
      rows: filtered,
      columns: exportCols,
      totals: [
        { label: "Total leads", value: String(filtered.length) },
        {
          label: "Pipeline value",
          value: formatINRCompact(filtered.reduce((s, l) => s + Number(l.budget ?? 0), 0)),
        },
      ],
    });

  const byStage = React.useMemo(() => {
    const map: Record<string, Lead[]> = {};
    STAGES.forEach((s) => (map[s.id] = []));
    filtered.forEach((l) => {
      (map[l.stage] ??= []).push(l);
    });
    return map;
  }, [filtered]);

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const stage = e.over.id as StageId;
    const id = e.active.id as string;
    const lead = leads.find((l) => l.id === id);
    if (lead && lead.stage !== stage) updateStage.mutate({ id, stage });
  };

  const activeLead = leads.find((l) => l.id === activeId);

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-5 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Lead CRM</p>
          <h1 className="mt-1 font-display text-3xl">Pipeline</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search leads…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-[260px] bg-card/40 pl-9"
            />
          </div>
          <div className="flex rounded-md border border-border bg-card/40 p-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("kanban")}
              className={view === "kanban" ? "bg-gradient-gold text-background hover:bg-gradient-gold" : ""}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("table")}
              className={view === "table" ? "bg-gradient-gold text-background hover:bg-gradient-gold" : ""}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <NewLeadDialog open={open} setOpen={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["leads"] })} />
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

      {view === "kanban" ? (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((s) => (
              <KanbanColumn key={s.id} stage={s.id} label={s.label} leads={byStage[s.id] ?? []} />
            ))}
          </div>
          <DragOverlay>{activeLead && <LeadCard lead={activeLead} dragging />}</DragOverlay>
        </DndContext>
      ) : (
        <div className="overflow-hidden rounded-2xl glass">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-card/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">City</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">Ad Name</th>
                <th className="px-4 py-3 text-left">Stage</th>
                <th className="px-4 py-3 text-right">Budget</th>
                <th className="px-4 py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-border/40 hover:bg-card/40">
                  <td className="px-4 py-3">
                    <Link to="/app/leads/$leadId" params={{ leadId: l.id }} className="font-medium hover:text-gold">
                      {l.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{l.email ?? l.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.city ?? "—"}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{l.source}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {l.ad_name ? (
                      <span className="block max-w-[180px] truncate" title={l.ad_name}>{l.ad_name}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3"><Badge variant="outline" className="border-gold/40 text-gold capitalize">{l.stage.replace("_", " ")}</Badge></td>
                  <td className="px-4 py-3 text-right">{l.budget ? formatINRCompact(Number(l.budget)) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {l.score ? (
                      <span className="inline-flex items-center gap-1 text-gold"><Sparkles className="h-3 w-3" />{l.score}</span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No leads found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ stage, label, leads }: { stage: StageId; label: string; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-2xl glass p-3 transition-colors ${
        isOver ? "border-gold/60 shadow-gold" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
        <Badge variant="outline" className="border-gold/30 text-gold">{leads.length}</Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {leads.map((l) => <LeadCard key={l.id} lead={l} />)}
      </div>
    </div>
  );
}

function LeadCard({ lead, dragging }: { lead: Lead; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-gold/40 hover:shadow-gold ${
        isDragging || dragging ? "opacity-50" : ""
      }`}
    >
      <Link to="/app/leads/$leadId" params={{ leadId: lead.id }} className="block">
        <div className="flex items-start justify-between">
          <div className="text-sm font-semibold">{lead.full_name}</div>
          {lead.score ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-gold">
              <Sparkles className="h-2.5 w-2.5" />{lead.score}
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{lead.email ?? lead.phone ?? "—"}</div>
        {lead.ad_name && (
          <div className="mt-1 truncate text-[10px] text-muted-foreground" title={lead.ad_name}>
            📣 {lead.ad_name}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <Badge variant="outline" className="capitalize">{lead.source}</Badge>
          {lead.budget && <span className="text-gold">{formatINRCompact(Number(lead.budget))}</span>}
        </div>
      </Link>
    </div>
  );
}

function NewLeadDialog({ open, setOpen, onCreated }: { open: boolean; setOpen: (v: boolean) => void; onCreated: () => void }) {
  const emptyForm = { full_name: "", email: "", phone: "", city: "", source: "manual", budget: "", ad_name: "" };
  const [form, setForm, clearFormDraft] = usePersistedState("leads.new", emptyForm);
  const [saving, setSaving] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("leads").insert({
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      city: form.city || null,
      source: form.source as any,
      budget: form.budget ? Number(form.budget) : null,
      ad_name: form.ad_name || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lead created");
    setForm(emptyForm);
    clearFormDraft();
    setOpen(false);
    onCreated();
  };

  return (
    <div className="flex items-center gap-2">
      <ImportButton configKey="leads" />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="bg-gradient-gold text-background hover:shadow-gold"><Plus className="mr-1 h-4 w-4" />New Lead</Button>
        </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">New lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Full name *</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" /></div>
            <div><Label>Budget (₹)</Label><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className="mt-1" /></div>
          </div>
          <div>
            <Label>Source</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="meta">Meta Ads</SelectItem>
                <SelectItem value="google">Google Ads</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="webinar">Webinar</SelectItem>
                <SelectItem value="website">Website</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ad Name</Label>
            <Input
              placeholder="e.g. Diwali Combo — Reel A"
              value={form.ad_name}
              onChange={(e) => setForm({ ...form, ad_name: e.target.value })}
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="bg-gradient-gold text-background">{saving ? "Saving…" : "Create lead"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </div>
  );
}
