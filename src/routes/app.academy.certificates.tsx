import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/academy/certificates")({
  head: () => ({ meta: [{ title: "Certificates — Academy" }] }),
  component: CertificatesPage,
});

function CertificatesPage() {
  const certs = useQuery({
    queryKey: ["certificates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("certificates")
        .select("*, enrollments(students(full_name), batches(batch_code, courses(title)))")
        .order("issued_on", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl">Certificates</h2>
        <p className="text-sm text-muted-foreground">All issued completion certificates.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(certs.data ?? []).map((c: any) => (
          <Card key={c.id} className="glass hover-gold-glow group p-5">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
                <Award className="h-5 w-5 text-background" />
              </div>
              <Badge variant="outline" className="border-primary/40 text-primary">{c.grade ?? "—"}</Badge>
            </div>
            <div className="mt-3 font-mono text-xs text-primary">{c.certificate_code}</div>
            <h3 className="mt-1 font-display text-lg">{c.enrollments?.students?.full_name ?? "—"}</h3>
            <p className="text-sm text-muted-foreground">{c.enrollments?.batches?.courses?.title ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Batch {c.enrollments?.batches?.batch_code} · Issued {c.issued_on}</p>
            <Link to="/verify/$code" params={{ code: c.certificate_code }} className="mt-3 inline-block">
              <Button size="sm" variant="outline">Verify <ExternalLink className="ml-1 h-3 w-3" /></Button>
            </Link>
          </Card>
        ))}
        {certs.data?.length === 0 && (
          <Card className="col-span-full p-10 text-center text-muted-foreground">No certificates issued yet.</Card>
        )}
      </div>
    </div>
  );
}
