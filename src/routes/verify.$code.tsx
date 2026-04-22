import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/verify/$code")({
  head: () => ({ meta: [{ title: "Verify Certificate — MMA Academy" }] }),
  component: VerifyPage,
});

function VerifyPage() {
  const { code } = Route.useParams();
  const cert = useQuery({
    queryKey: ["verify", code],
    queryFn: async () => {
      const { data } = await supabase
        .from("certificates")
        .select("*, enrollments(students(full_name), batches(batch_code, courses(title, duration_weeks)))")
        .eq("certificate_code", code)
        .maybeSingle();
      return data;
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="glass w-full max-w-lg p-8 text-center">
        {cert.isLoading ? (
          <p className="text-muted-foreground">Verifying…</p>
        ) : cert.data ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-gold shadow-gold">
              <Award className="h-8 w-8 text-background" />
            </div>
            <div className="mt-4 inline-flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> <span className="text-sm font-medium">Verified Certificate</span>
            </div>
            <h1 className="mt-3 font-display text-3xl text-gradient-gold">
              {cert.data.enrollments?.students?.full_name}
            </h1>
            <p className="mt-2 text-muted-foreground">has successfully completed</p>
            <h2 className="mt-1 font-display text-xl">{cert.data.enrollments?.batches?.courses?.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Batch {cert.data.enrollments?.batches?.batch_code} · {cert.data.enrollments?.batches?.courses?.duration_weeks} weeks
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border/50 pt-5">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Grade</div>
                <div className="font-display text-lg">{cert.data.grade ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Issued</div>
                <div className="font-display text-lg">{cert.data.issued_on}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Code</div>
                <div className="font-mono text-xs">{cert.data.certificate_code}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-12 w-12 text-rose-400" />
            <h1 className="mt-3 font-display text-2xl">Certificate Not Found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              No record exists for code <span className="font-mono">{code}</span>.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
