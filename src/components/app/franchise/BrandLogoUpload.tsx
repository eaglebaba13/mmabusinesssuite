import * as React from "react";
import { toast } from "sonner";
import { Upload, X, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "./BrandLogo";

const BUCKET = "brand-logos";
const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
const ACCEPT_ATTR = "image/png,image/jpeg,image/jpg,image/svg+xml,image/webp";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extFromType(type: string, name: string) {
  if (type === "image/svg+xml") return "svg";
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "png";
}

export function BrandLogoUpload({
  value,
  onChange,
  meta,
  onMetaChange,
  required,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
  meta?: { name: string; size: number } | null;
  onMetaChange?: (meta: { name: string; size: number } | null) => void;
  required?: boolean;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Unsupported file type. Use PNG, JPG, SVG, or WEBP.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("File too large. Max size is 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = extFromType(file.type, file.name);
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      // Best-effort delete of previous file (only if it looks like a bucket path)
      if (value && !/^https?:\/\//i.test(value)) {
        await supabase.storage.from(BUCKET).remove([value]).catch(() => {});
      }
      onChange(path);
      onMetaChange?.({ name: file.name, size: file.size });
      toast.success("Logo uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (value && !/^https?:\/\//i.test(value)) {
      await supabase.storage.from(BUCKET).remove([value]).catch(() => {});
    }
    onChange(null);
    onMetaChange?.(null);
  }

  function onFiles(files: FileList | null) {
    if (!files || !files[0]) return;
    void upload(files[0]);
  }

  if (value) {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-4">
          <div className="h-[100px] w-[100px] shrink-0 overflow-hidden rounded-md border bg-muted">
            <BrandLogo path={value} alt="Brand logo" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{meta?.name ?? "Brand logo"}</div>
            {meta?.size ? (
              <div className="text-xs text-muted-foreground">{formatSize(meta.size)}</div>
            ) : (
              <div className="text-xs text-muted-foreground">Uploaded</div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Replace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={remove}
                disabled={uploading}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed p-8 text-center transition-colors",
        dragOver ? "border-primary bg-primary/5" : "hover:border-primary/50",
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      {uploading ? (
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      ) : (
        <Upload className="h-8 w-8 text-muted-foreground" />
      )}
      <div className="font-medium">
        {uploading ? "Uploading…" : "Upload Logo"}
        {required && !uploading ? <span className="ml-1 text-destructive">*</span> : null}
      </div>
      <div className="text-xs text-muted-foreground">Drag &amp; drop or click to browse</div>
      <div className="text-xs text-muted-foreground">PNG • JPG • SVG • WEBP (Max 5 MB)</div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
    </Card>
  );
}
