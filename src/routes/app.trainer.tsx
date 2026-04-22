import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Users2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/trainer")({
  head: () => ({ meta: [{ title: "Trainer Portal — MMA Academy" }] }),
  component: TrainerPortal,
});

function TrainerPortal() {
  const { user } = useAuth();
  const trainer = useQuery({
    queryKey: ["trainer-self", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("trainers").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const batches = useQuery({
    queryKey: ["trainer-batches", trainer.data?.id],
    queryFn: async () => {
      if (!trainer.data?.id) return [];
      const { data } = await supabase
        .from("batches")
        .select("*, courses(title, code), enrollments(count)")
        .eq("trainer_id", trainer.data.id)
        .order("start_date", { ascending: false });
      return data ?? [];
    },
    enabled: !!trainer.data?.id,
  });

  if (!trainer.isLoading && !trainer.data) {
    return (
      <div className="p-8">
        <Card className="glass p-8 text-center">
          <h2 className="font-display text-xl">Trainer profile not linked</h2>
          <p className="mt-2 text-muted-foreground">
            Your account isn't linked to a trainer record yet. Ask an academy admin to associate your user.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="font-display text-2xl text-gradient-gold">Welcome, {trainer.data?.full_name}</h1>
        <p className="text-sm text-muted-foreground">{trainer.data?.specialization}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold"><CalendarDays className="h-5 w-5 text-background" /></div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">My Batches</div>
              <div className="font-display text-2xl">{batches.data?.length ?? 0}</div>
            </div>
          </div>
        </Card>
        <Card className="glass p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold"><Users2 className="h-5 w-5 text-background" /></div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Total Students</div>
              <div className="font-display text-2xl">
                {(batches.data ?? []).reduce((s: number, b: any) => s + (b.enrollments?.[0]?.count ?? 0), 0)}
              </div>
            </div>
          </div>
        </Card>
        <Card className="glass p-5">
          <div className="text-xs uppercase text-muted-foreground">Active</div>
          <div className="font-display text-2xl">
            {(batches.data ?? []).filter((b: any) => b.status === "ongoing").length}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg">Your Batches</h2>
        <div className="grid gap-3">
          {(batches.data ?? []).map((b: any) => (
            <Card key={b.id} className="glass hover-gold-glow flex items-center justify-between p-4">
              <div>
                <Badge variant="outline" className="border-primary/40 text-primary">{b.batch_code}</Badge>
                <h3 className="mt-1 font-display text-lg">{b.courses?.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {b.start_date} → {b.end_date ?? "—"} · {b.enrollments?.[0]?.count ?? 0} students
                </p>
              </div>
              <Link to="/app/academy/batches/$batchId" params={{ batchId: b.id }}>
                <Button>Open <ArrowRight className="ml-1 h-3 w-3" /></Button>
              </Link>
            </Card>
          ))}
          {batches.data?.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">No batches assigned yet.</Card>
          )}
        </div>
      </div>
    </div>
  );
}
