import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FranchiseeDashboard } from "@/components/app/FranchiseeDashboard";

export const Route = createFileRoute("/app/my-franchise")({
  head: () => ({ meta: [{ title: "My Franchise — MMA Suite" }] }),
  component: MyFranchisePage,
});

function MyFranchisePage() {
  const { user } = useAuth();
  const { data: f, isLoading } = useQuery({
    queryKey: ["my-franchise", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("franchisees").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  }

  if (!f) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <h1 className="font-display text-3xl">No franchise on record</h1>
        <p className="mt-2 text-muted-foreground">Contact your account manager to link your franchise profile.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <FranchiseeDashboard
        franchiseeId={f.id}
        franchiseeName={f.full_name}
        investment={Number(f.investment_amount)}
        joinedAt={f.joined_at}
        status={f.status}
      />

      <Link
        to="/app/support"
        className="flex items-center justify-center gap-2 rounded-2xl glass p-4 text-sm text-gold hover:bg-card/60"
      >
        <LifeBuoy className="h-4 w-4" /> Open a support ticket
      </Link>
    </div>
  );
}
