import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Trash2, CheckCircle2, Circle, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";

const KINDS = ["aadhaar", "pan", "gst", "agreement", "brochure", "photo", "bank", "other"] as const;
type Kind = (typeof KINDS)[number];

type DocRow = {
  id: string;
  franchisee_id: string;
  kind: Kind;
  file_url: string;
  storage_path: string | null;
  file_name: string | null;
  content_type: string | null;
  size_bytes: number | null;
  is_verified: boolean;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export function DocumentVault({ franchiseeId }: { franchiseeId: string }) {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [kind, setKind] = React.useState<Kind>("aadhaar");
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["franchisee-docs", franchiseeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchisee_documents")
        .select("*")
        .eq("franchisee_id", franchiseeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${franchiseeId}/${kind}-${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("franchisee-docs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from("franchisee-docs")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      const { error: insErr } = await (supabase as any).from("franchisee_documents").insert({
        franchisee_id: franchiseeId,
        kind,
        file_url: signed?.signedUrl ?? "",
        storage_path: path,
        file_name: file.name,
        content_type: file.type,
        size_bytes: file.size,
        uploaded_by: user?.id ?? null,
      });
      if (insErr) throw insErr;

      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: ["franchisee-docs", franchiseeId] });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toggleVerify = useMutation({
    mutationFn: async (doc: DocRow) => {
      const { error } = await (supabase as any)
        .from("franchisee_documents")
        .update({
          is_verified: !doc.is_verified,
          verified_by: !doc.is_verified ? user?.id ?? null : null,
          verified_at: !doc.is_verified ? new Date().toISOString() : null,
        })
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["franchisee-docs", franchiseeId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const del = useMutation({
    mutationFn: async (doc: DocRow) => {
      if (doc.storage_path) {
        await supabase.storage.from("franchisee-docs").remove([doc.storage_path]);
      }
      const { error } = await (supabase as any)
        .from("franchisee_documents")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["franchisee-docs", franchiseeId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const openFile = async (doc: DocRow) => {
    if (!doc.storage_path) {
      window.open(doc.file_url, "_blank");
      return;
    }
    const { data, error } = await supabase.storage
      .from("franchisee-docs")
      .createSignedUrl(doc.storage_path, 60 * 5);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Card className="p-6">
      <h3 className="mb-4 font-display text-xl">Document Vault</h3>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border/40 bg-background/30 p-3">
        <div>
          <Label className="text-xs">Type</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="mt-1 h-10 rounded-md border border-border bg-card/40 px-2 text-sm capitalize"
          >
            {KINDS.map((k) => (
              <option key={k} value={k} className="capitalize">
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">File</Label>
          <Input
            ref={inputRef}
            type="file"
            className="mt-1"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            disabled={uploading}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {uploading ? "Uploading…" : "Choose a file to upload."}
        </div>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/30 p-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-5 w-5 text-primary/70" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.file_name ?? "(untitled)"}</div>
                  <div className="text-xs text-muted-foreground">
                    <Badge variant="outline" className="mr-2 capitalize">{d.kind}</Badge>
                    {d.size_bytes ? `${Math.round(d.size_bytes / 1024)} KB · ` : ""}
                    {format(new Date(d.created_at), "dd MMM yyyy")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {d.is_verified ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <Circle className="mr-1 h-3 w-3" /> Unverified
                  </Badge>
                )}
                <Button size="sm" variant="ghost" onClick={() => openFile(d)}>
                  <Download className="h-4 w-4" />
                </Button>
                {isAdmin && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => toggleVerify.mutate(d)}>
                      {d.is_verified ? "Unverify" : "Verify"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => del.mutate(d)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
