import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listActiveImpersonationSessions, revokeImpersonationSession } from "@/lib/rpc/impersonation.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/impersonation-sessions")({
  head: () => ({ meta: [{ title: "Active Impersonation Sessions — MMA Suite" }] }),
  component: Page,
});

function Page() {
  const list = useServerFn(listActiveImpersonationSessions);
  const revoke = useServerFn(revokeImpersonationSession);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["impersonation-sessions"],
    queryFn: () => list({ data: undefined as never }),
    refetchInterval: 15_000,
  });

  const mut = useMutation({
    mutationFn: (session_id: string) => revoke({ data: { session_id } }),
    onSuccess: () => { toast.success("Session revoked"); qc.invalidateQueries({ queryKey: ["impersonation-sessions"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.sessions ?? [];

  return (
    <div className="space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Active Impersonation Sessions</h1>
        <p className="text-sm text-muted-foreground">All currently valid admin impersonation tokens. Revoke to terminate immediately.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Live sessions ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active impersonation sessions.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admin</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.admin_name}</TableCell>
                    <TableCell>{s.entity_name}</TableCell>
                    <TableCell><Badge variant="outline">{s.entity_type}</Badge></TableCell>
                    <TableCell><Badge variant={s.mode === "read_only" ? "secondary" : "destructive"}>{s.mode}</Badge></TableCell>
                    <TableCell className="text-xs">{new Date(s.started_at).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-xs">{new Date(s.expires_at).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="destructive" onClick={() => mut.mutate(s.id)} disabled={mut.isPending}>
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
