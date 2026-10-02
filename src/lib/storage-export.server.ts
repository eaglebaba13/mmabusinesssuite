import { zipSync } from "fflate";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const STORAGE_EXPORT_BUCKETS = [
  "product-media",
  "franchisee-docs",
  "brand-logos",
  "roi-claims",
  "official-documents",
  "invoice-sources",
  "database_export_01_10_26",
] as const;

type ArchiveEntries = Record<string, Uint8Array>;

async function listFiles(bucket: string, folder = ""): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(folder, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Could not read ${bucket}: ${error.message}`);

    const rows = data ?? [];
    for (const row of rows) {
      const path = folder ? `${folder}/${row.name}` : row.name;
      if (row.id) files.push(path);
      else files.push(...(await listFiles(bucket, path)));
    }

    if (rows.length < 1000) break;
    offset += rows.length;
  }

  return files;
}

export async function createCompleteStorageZip() {
  const entries: ArchiveEntries = {};
  let fileCount = 0;

  for (const bucket of STORAGE_EXPORT_BUCKETS) {
    entries[`${bucket}/`] = new Uint8Array();
    const paths = await listFiles(bucket);

    for (const path of paths) {
      const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
      if (error || !data) {
        throw new Error(`Could not include ${bucket}/${path}: ${error?.message ?? "file unavailable"}`);
      }
      entries[`${bucket}/${path}`] = new Uint8Array(await data.arrayBuffer());
      fileCount += 1;
    }
  }

  return {
    bytes: zipSync(entries, { level: 6 }),
    fileCount,
    bucketCount: STORAGE_EXPORT_BUCKETS.length,
  };
}