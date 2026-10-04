import { STORAGE_BUCKETS } from "@/lib/storage-policy";
import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, CheckCircle2, Download, HardDrive, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const BUCKETS = STORAGE_BUCKETS;

export const Route = createFileRoute("/app/settings/storage-export")({
  head: () => ({
    meta: [
      { title: "Complete Storage Export — MMA Suite" },
      { name: "description", content: "Securely package all MMA Suite private storage into one ZIP archive." },
      { property: "og:title", content: "Complete Storage Export — MMA Suite" },
      { property: "og:description", content: "Super Admin storage backup and ZIP export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StorageExportPage,
});

function StorageExportPage() {
  const { hasRole, loading } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = hasRole("super_admin");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [lastExport, setLastExport] = React.useState<{ files: number; buckets: number } | null>(null);

  React.useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/app/settings", replace: true });
  }, [isSuperAdmin, loading, navigate]);

  const download = async () => {
    setConfirmOpen(false);
    setExporting(true);
    setLastExport(null);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error("Please sign in again before exporting.");

      const response = await fetch("/api/storage-export", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "The ZIP could not be created.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "mma-complete-storage.zip";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      const files = Number(response.headers.get("x-archive-files") ?? 0);
      const buckets = Number(response.headers.get("x-archive-buckets") ?? BUCKETS.length);
      setLastExport({ files, buckets });
      toast.success(`Complete storage ZIP downloaded with ${files} files.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Storage export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading || !isSuperAdmin) return null;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-gold/30">
        <div className="border-b border-border/50 bg-primary/5 p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gold/30 bg-primary/10 text-gold">
                <Archive aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl">Complete Storage ZIP</h2>
                  <Badge variant="outline" className="border-gold/40 text-gold">Super Admin</Badge>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Download every file from all private storage areas in one ZIP. Original folder paths are preserved.
                </p>
              </div>
            </div>
            <Button onClick={() => setConfirmOpen(true)} disabled={exporting} className="bg-gradient-gold text-background shadow-gold">
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              {exporting ? "Preparing ZIP…" : "Download complete storage"}
            </Button>
          </div>
        </div>

        <div className="grid gap-px bg-border/40 md:grid-cols-2">
          <div className="bg-card p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <HardDrive className="text-gold" /> Included storage
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {BUCKETS.map((bucket) => (
                <div key={bucket} className="flex min-w-0 items-center gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-gold" />
                  <span className="truncate font-mono text-xs">{bucket}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="text-gold" /> Private and complete
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>Only a signed-in Super Admin can create this download.</li>
              <li>No public link or permanent archive is created.</li>
              <li>The download stops if any stored file cannot be included.</li>
            </ul>
            {exporting && (
              <div className="mt-5 space-y-2" aria-live="polite">
                <Progress value={55} className="animate-pulse" />
                <p className="text-xs text-muted-foreground">Collecting and compressing files. Keep this page open.</p>
              </div>
            )}
            {lastExport && (
              <div className="mt-5 rounded-md border border-gold/30 bg-primary/5 p-3 text-sm" aria-live="polite">
                Download ready: {lastExport.files} files from {lastExport.buckets} storage areas.
              </div>
            )}
          </div>
        </div>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Download complete private storage?</AlertDialogTitle>
            <AlertDialogDescription>
              One ZIP will contain all files from the six listed application storage areas. Large exports may take several minutes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={download}>Create and download ZIP</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}