import { storageService } from "@/lib/storage";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { legacyStoragePath } from "@/lib/storage-policy";
import { cn } from "@/lib/utils";

const BUCKET = "brand-logos";

export function useBrandLogoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["brand-logo-signed", path],
    enabled: !!path,
    staleTime: 55 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      // Support legacy full URLs stored in the column
      const objectPath = legacyStoragePath(path, BUCKET);
      if (objectPath === null) return path;
      const { data, error } = await storageService
        .from(BUCKET)
        .createSignedUrl(objectPath, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function BrandLogo({
  path,
  alt,
  className,
  fallback,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const { data: url } = useBrandLogoUrl(path);
  if (!path) return <>{fallback ?? null}</>;
  if (!url) {
    return <div className={cn("animate-pulse bg-muted", className)} />;
  }
  return <img src={url} alt={alt} className={className} />;
}
