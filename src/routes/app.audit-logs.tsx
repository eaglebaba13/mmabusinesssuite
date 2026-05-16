import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Filter, X } from "lucide-react";

export const Route = createFileRoute("/app/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs — MMA Suite" }] }),
  component: AuditLogsPage,
});

const ENTITY_TYPES = ["state_franchise", "city_franchise", "academy", "dark_store", "salon_branch", "company", "department"];
const ACTIONS = ["start", "resolve", "end", "view", "export"];

function AuditLogsPage() {
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [action, setAction] = React.useState("all");
  const [entityType, setEntityType] = React.useState("all");
  const [sessionId, setSessionId] = React.useState("");

  // Admin user picker
  const adminsQ = useQuery({
    queryKey: ["audit-admins"],
    queryFn: async () => {
      const { data } = await supabase
        .from("impersonation_sessions")
        .select("acting_admin_id")
        .limit(500);
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.acting_admin_id)));
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      return profs ?? [];
    },
  });

  const impQ = useQuery({
    queryKey: ["imp-sessions", dateFrom, dateTo, userId, entityType, sessionId],
    queryFn: async () => {
      let q = supabase
        .from("impersonation_sessions")
        .select("*, profiles!impersonation_sessions_acting_admin_id_fkey(full_name,email)")
        .order("started_at", { ascending: false })
        .limit(200);
      if (dateFrom) q = q.gte("started_at", dateFrom);
      if (dateTo) q = q.lte("started_at", dateTo + "T23:59:59");
      if (userId) q = q.eq("acting_admin_id", userId);
      if (entityType !== "all") q = q.eq("entity_type", entityType as any);
      if (sessionId) q = q.eq("id", sessionId);
      const { data, error } = await q;
      if (error) {
        // FK alias may not exist — fall back to plain query
        let q2 = supabase.from("impersonation_sessions").select("*").order("started_at", { ascending: false }).limit(200);
        if (dateFrom) q2 = q2.gte("started_at", dateFrom);
        if (dateTo) q2 = q2.lte("started_at", dateTo + "T23:59:59");
        if (userId) q2 = q2.eq("acting_admin_id", userId);
        if (entityType !== "all") q2 = q2.eq("entity_type", entityType as any);
        if (sessionId) q2 = q2.eq("id", sessionId);
        const { data: d2, error: e2 } = await q2;
        if (e2) throw e2;
        return d2;
      }
      return data;
    },
  });

  const auditQ = useQuery({
    queryKey: ["imp-audit", dateFrom, dateTo, action, sessionId],
    queryFn: async () => {
      let q = supabase.from("impersonation_audit").select("*").order("at", { ascending: false }).limit(500);
      if (dateFrom) q = q.gte("at", dateFrom);
      if (dateTo) q = q.lte("at", dateTo + "T23:59:59");
      if (action !== "all") q = q.eq("action", action);
      if (sessionId) q = q.eq("session_id", sessionId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const adminMap = React.useMemo(() => {
    const m = new Map<string, any>();
    (adminsQ.data ?? []).forEach((p: any) => m.set(p.id, p));
    return m;
  }, [adminsQ.data]);

  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setUserId(""); setAction("all"); setEntityType("all"); setSessionId("");
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-gold">Security</p>
        <h1 className="font-display text-3xl">Audit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Impersonation sessions and admin-triggered actions.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" /> Filters</CardTitle>
          <Button size="sm" variant="ghost" onClick={clearFilters}><X className="mr-1 h-3.5 w-3.5" /> Reset</Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div><Label className="text-xs">From</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Admin</Label>
            <Select value={userId || "all"} onValueChange={(v) => setUserId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All admins" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All admins</SelectItem>
                {(adminsQ.data ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Entity type</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {ENTITY_TYPES.map((e) => <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Session ID</Label><Input placeholder="uuid" value={sessionId} onChange={(e) => setSessionId(e.target.value.trim())} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Impersonation sessions</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Started</TableHead><TableHead>Admin</TableHead><TableHead>Entity</TableHead>
              <TableHead>Mode</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {impQ.data?.map((s: any) => {
                const ended = s.ended_at;
                const expired = !ended && new Date(s.expires_at).getTime() < Date.now();
                const admin = s.profiles ?? adminMap.get(s.acting_admin_id);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{new Date(s.started_at).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-xs">{admin?.full_name ?? admin?.email ?? <span className="font-mono">{s.acting_admin_id.slice(0, 8)}…</span>}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{s.entity_type}</Badge>{" "}
                      <span className="font-mono">{s.entity_id.slice(0, 8)}…</span>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{s.mode}</Badge></TableCell>
                    <TableCell className="text-xs">{new Date(s.expires_at).toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      <Badge variant={ended ? "outline" : expired ? "destructive" : "default"} className="text-xs">
                        {ended ? "ended" : expired ? "expired" : "active"}
                      </Badge>
                    </TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => setSessionId(s.id)}>Trail →</Button></TableCell>
                  </TableRow>
                );
              })}
              {impQ.data?.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No sessions match filters</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Action trail{sessionId && <Badge variant="outline" className="ml-2 font-mono text-[10px]">session {sessionId.slice(0, 8)}…</Badge>}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>At</TableHead><TableHead>Session</TableHead><TableHead>Action</TableHead><TableHead>Resource</TableHead><TableHead>Payload</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {auditQ.data?.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs">{new Date(a.at).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-xs font-mono">{a.session_id.slice(0, 8)}…</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{a.action}</Badge></TableCell>
                  <TableCell className="text-xs">{a.resource ?? "—"}</TableCell>
                  <TableCell className="max-w-md truncate font-mono text-[10px] text-muted-foreground">{a.payload ? JSON.stringify(a.payload) : "—"}</TableCell>
                </TableRow>
              ))}
              {auditQ.data?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No activity</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
