import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs — MMA Suite" }] }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const impQ = useQuery({
    queryKey: ["imp-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impersonation_sessions")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const auditQ = useQuery({
    queryKey: ["imp-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impersonation_audit")
        .select("*")
        .order("at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-gold">Security</p>
        <h1 className="font-display text-3xl">Audit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Impersonation sessions and admin-triggered actions.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Impersonation sessions</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Started</TableHead><TableHead>Admin</TableHead><TableHead>Entity</TableHead>
              <TableHead>Mode</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {impQ.data?.map((s: any) => {
                const ended = s.ended_at;
                const expired = !ended && new Date(s.expires_at).getTime() < Date.now();
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{new Date(s.started_at).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-xs font-mono">{s.acting_admin_id.slice(0, 8)}…</TableCell>
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
                  </TableRow>
                );
              })}
              {impQ.data?.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No sessions</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Action trail</CardTitle></CardHeader>
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
