import * as React from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, LayoutDashboard, Users, Megaphone, Activity, FolderLock, FileSignature } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FranchiseeDashboard } from "@/components/app/FranchiseeDashboard";
import { FranchiseeLeadsPanel } from "@/components/app/FranchiseeLeadsPanel";
import { FranchiseeCampaignsPanel } from "@/components/app/FranchiseeCampaignsPanel";
import { FranchiseeTimeline } from "@/components/app/FranchiseeTimeline";
import { DocumentVault } from "@/components/app/franchise/DocumentVault";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const searchSchema = z.object({
  tab: z
    .enum(["dashboard", "leads", "campaigns", "timeline", "documents", "agreements"])
    .optional(),
});

export const Route = createFileRoute("/app/my-franchise")({
  head: () => ({ meta: [{ title: "My Franchise — MMA Suite" }] }),
  validateSearch: searchSchema,
  component: MyFranchisePage,
});

function MyFranchisePage() {
  const { user } = useAuth();
  const search = useSearch({ from: "/app/my-franchise" });
  const tab = search.tab ?? "dashboard";

  const { data: f, isLoading } = useQuery({
    queryKey: ["my-franchise", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Primary: link by user_id
      const byUser = await supabase
        .from("franchisees")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (byUser.data) return byUser.data;

      // Fallback: match by email (handles seed records where user_id wasn't backfilled yet)
      if (user?.email) {
        const byEmail = await supabase
          .from("franchisees")
          .select("*")
          .ilike("email", user.email)
          .maybeSingle();
        return byEmail.data;
      }
      return null;
    },
  });

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  }

  if (!f) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <h1 className="font-display text-3xl">No franchise on record</h1>
        <p className="mt-2 text-muted-foreground">
          Contact your account manager to link your franchise profile.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <Tabs value={tab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
          <TabsTrigger value="dashboard" asChild>
            <Link to="/app/my-franchise" search={{ tab: "dashboard" }} className="flex items-center gap-1.5">
              <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
            </Link>
          </TabsTrigger>
          <TabsTrigger value="leads" asChild>
            <Link to="/app/my-franchise" search={{ tab: "leads" }} className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Leads
            </Link>
          </TabsTrigger>
          <TabsTrigger value="campaigns" asChild>
            <Link to="/app/my-franchise" search={{ tab: "campaigns" }} className="flex items-center gap-1.5">
              <Megaphone className="h-3.5 w-3.5" /> Campaigns
            </Link>
          </TabsTrigger>
          <TabsTrigger value="timeline" asChild>
            <Link to="/app/my-franchise" search={{ tab: "timeline" }} className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Timeline
            </Link>
          </TabsTrigger>
          <TabsTrigger value="documents" asChild>
            <Link to="/app/my-franchise" search={{ tab: "documents" }} className="flex items-center gap-1.5">
              <FolderLock className="h-3.5 w-3.5" /> Documents
            </Link>
          </TabsTrigger>
          <TabsTrigger value="agreements" asChild>
            <Link to="/app/my-franchise" search={{ tab: "agreements" }} className="flex items-center gap-1.5">
              <FileSignature className="h-3.5 w-3.5" /> Agreements
            </Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <FranchiseeDashboard
            franchiseeId={f.id}
            franchiseeName={f.full_name}
            investment={Number(f.investment_amount)}
            joinedAt={f.joined_at}
            status={f.status}
            territoryId={f.territory_id}
          />
        </TabsContent>

        <TabsContent value="leads" className="mt-6">
          <FranchiseeLeadsPanel territoryId={f.territory_id} />
        </TabsContent>

        <TabsContent value="campaigns" className="mt-6">
          <FranchiseeCampaignsPanel territoryId={f.territory_id} franchiseeId={f.id} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <FranchiseeTimeline franchiseeId={f.id} territoryId={f.territory_id} />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentVault franchiseeId={f.id} />
        </TabsContent>

        <TabsContent value="agreements" className="mt-6">
          <MyAgreements franchiseeId={f.id} />
        </TabsContent>
      </Tabs>

      <Link
        to="/app/support"
        className="flex items-center justify-center gap-2 rounded-2xl glass p-4 text-sm text-gold hover:bg-card/60"
      >
        <LifeBuoy className="h-4 w-4" /> Open a support ticket
      </Link>
    </div>
  );
}

function MyAgreements({ franchiseeId }: { franchiseeId: string }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-agreements", franchiseeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_agreements")
        .select("id, product_id, version, status, valid_from, valid_till, created_at, merged_html")
        .eq("franchisee_id", franchiseeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>;
  }
  if (rows.length === 0) {
    return (
      <Card className="p-12 text-center">
        <FileSignature className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No agreements addressed to you yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your account manager will generate an agreement here when ready.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((a: any) => (
        <Card key={a.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">Agreement {a.version}</div>
              <div className="text-xs text-muted-foreground">
                {a.valid_from ?? "—"} → {a.valid_till ?? "—"} · created{" "}
                {format(new Date(a.created_at), "dd MMM yyyy")}
              </div>
            </div>
            <Badge variant="outline" className="capitalize">{a.status}</Badge>
          </div>
          {a.merged_html && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-gold hover:underline">
                View full text
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border/40 bg-background/30 p-3 text-xs">
                {a.merged_html}
              </pre>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}

