import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Users, CheckCircle2, Sparkles, Video, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { KpiCard } from "@/components/app/KpiCard";
import { ExportBar } from "@/components/app/ExportBar";
import { defaultDateRange, exportToCSV, exportToPDF, inDateRange } from "@/lib/export";

const LEAD_STAGES = ["new", "interested", "followup", "hot", "payment_pending", "closed", "lost"] as const;

export const Route = createFileRoute("/app/webinars/$webinarId")({
  head: () => ({ meta: [{ title: "Webinar — MMA Suite" }] }),
  component: WebinarDetail,
});

function WebinarDetail() {
  const { webinarId } = Route.useParams();
  const qc = useQueryClient();
  const [range, setRange] = React.useState(defaultDateRange());

  const webinar = useQuery({
    queryKey: ["webinar", webinarId],
    queryFn: async () => {
      const { data, error } = await supabase.from("webinars").select("*").eq("id", webinarId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const regs = useQuery({
    queryKey: ["webinar-regs", webinarId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webinar_registrations")
        .select("*, leads(id, stage)")
        .eq("webinar_id", webinarId)
        .order("registered_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateLeadStage = useMutation({
    mutationFn: async ({ leadId, stage }: { leadId: string; stage: string }) => {
      const { error } = await supabase.from("leads").update({ stage: stage as any }).eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead stage updated");
      qc.invalidateQueries({ queryKey: ["webinar-regs", webinarId] });
    },
    onError: () => toast.error("Couldn't update lead stage"),
  });

  const toggleAttend = useMutation({
    mutationFn: async ({ id, attended }: { id: string; attended: boolean }) => {
      const { error } = await supabase
        .from("webinar_registrations")
        .update({ attended, attended_at: attended ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webinar-regs", webinarId] }),
    onError: () => toast.error("Couldn't update attendance"),
  });

  const list = (regs.data ?? []).filter((r: any) => inDateRange(r.registered_at, range.from, range.to));
  const total = list.length;
  const attended = list.filter((r: any) => r.attended).length;
  const converted = list.filter((r: any) => r.leads && !["new", "lost"].includes(r.leads.stage)).length;
  const attendanceRate = total ? Math.round((attended / total) * 100) : 0;
  const conversionRate = attended ? Math.round((converted / attended) * 100) : 0;

  const exportCols = [
    { header: "Name", accessor: (r: any) => r.full_name },
    { header: "Email", accessor: (r: any) => r.email },
    { header: "Phone", accessor: (r: any) => r.phone ?? "" },
    { header: "City", accessor: (r: any) => r.city ?? "" },
    { header: "UTM Source", accessor: (r: any) => r.utm_source ?? "" },
    { header: "UTM Campaign", accessor: (r: any) => r.utm_campaign ?? "" },
    { header: "Registered", accessor: (r: any) => r.registered_at?.slice(0, 16).replace("T", " ") ?? "" },
    { header: "Attended", accessor: (r: any) => (r.attended ? "Yes" : "No") },
    { header: "Lead Stage", accessor: (r: any) => r.leads?.stage ?? "" },
  ];
  const fileBase = `webinar_${webinar.data?.slug ?? webinarId}_${range.from}_to_${range.to}`;
  const onCSV = () => exportToCSV(fileBase, list, exportCols);
  const onPDF = () =>
    exportToPDF({
      filename: fileBase,
      title: webinar.data?.title ?? "Webinar Registrations",
      subtitle: `${range.from} → ${range.to}`,
      rows: list,
      columns: exportCols,
      totals: [
        { label: "Registrations", value: String(total) },
        { label: "Attended", value: `${attended} (${attendanceRate}%)` },
        { label: "Converted", value: `${converted} (${conversionRate}%)` },
      ],
    });

  const copyRegLink = () => {
    if (!webinar.data?.slug) return;
    navigator.clipboard.writeText(`${window.location.origin}/webinar/${webinar.data.slug}`);
    toast.success("Registration link copied");
  };

  if (webinar.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!webinar.data) {
    return <div className="p-6 text-sm text-muted-foreground">Webinar not found.</div>;
  }
  const w = webinar.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/app/webinars" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Back to campaigns
          </Link>
          <h2 className="mt-1 font-display text-2xl">{w.title}</h2>
          <p className="text-xs text-muted-foreground capitalize">
            {w.platform.replace("_", " ")} · {w.host_name ?? "—"} · <Badge variant="outline" className="ml-1 capitalize">{w.status}</Badge>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(w.scheduled_at), "dd MMM yyyy, HH:mm")}</span>
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />Capacity {w.capacity}</span>
            <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" />{w.duration_minutes} min</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copyRegLink}><Copy className="mr-1 h-3 w-3" />Copy reg link</Button>
          {w.join_url && (
            <a href={w.join_url} target="_blank" rel="noreferrer">
              <Button size="sm" className="bg-gradient-gold text-background"><ExternalLink className="mr-1 h-3 w-3" />Join</Button>
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Registrations" value={String(total)} icon={Users} />
        <KpiCard label="Attended" value={`${attended} · ${attendanceRate}%`} icon={CheckCircle2} delay={0.05} />
        <KpiCard label="Converted leads" value={`${converted} · ${conversionRate}%`} icon={Sparkles} delay={0.1} />
        <KpiCard label="Capacity used" value={`${total ? Math.round((total / w.capacity) * 100) : 0}%`} icon={Video} delay={0.15} />
      </div>

      <ExportBar
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onCSV={onCSV}
        onPDF={onPDF}
        count={list.length}
      />

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>UTM</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Attended</TableHead>
              <TableHead>Lead</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.full_name}</div>
                  <div className="text-xs text-muted-foreground">{r.city ?? "—"}</div>
                </TableCell>
                <TableCell className="text-sm">
                  <div>{r.email}</div>
                  <div className="text-xs text-muted-foreground">{r.phone ?? "—"}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.utm_source ? <div>{r.utm_source}</div> : "—"}
                  {r.utm_campaign && <div className="text-[10px]">{r.utm_campaign}</div>}
                </TableCell>
                <TableCell className="text-xs">{format(new Date(r.registered_at), "dd MMM HH:mm")}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant={r.attended ? "default" : "outline"}
                    className={r.attended ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : ""}
                    onClick={() => toggleAttend.mutate({ id: r.id, attended: !r.attended })}
                  >
                    {r.attended ? <><CheckCircle2 className="mr-1 h-3 w-3" />Present</> : "Mark"}
                  </Button>
                </TableCell>
                <TableCell>
                  {r.lead_id ? (
                    <Link to="/app/leads/$leadId" params={{ leadId: r.lead_id }}>
                      <Badge variant="outline" className="border-gold/40 text-gold capitalize">{r.leads?.stage ?? "lead"}</Badge>
                    </Link>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
            {list.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No registrations in this range.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
