import { zipSync } from "fflate";
import { STORAGE_BUCKETS } from "./storage-policy";
import { createMinioBackend } from "./storage.server";

export const STORAGE_EXPORT_BUCKETS = STORAGE_BUCKETS;

/** Called only after /api/storage-export verifies the user's Super Admin role. */
export async function createCompleteStorageZip() {
  const backend = createMinioBackend();
  const entries: Record<string, Uint8Array> = {};
  let fileCount = 0;
  for (const bucket of STORAGE_EXPORT_BUCKETS) {
    entries[`${bucket}/`] = new Uint8Array();
    const paths = await backend.listFiles(bucket);
    for (const path of paths) {
      const file = await backend.get(bucket, path);
      entries[`${bucket}/${path}`] = new Uint8Array(await new Response(file.body).arrayBuffer());
      fileCount += 1;
    }
  }
  return { bytes: zipSync(entries, { level: 6 }), fileCount, bucketCount: STORAGE_EXPORT_BUCKETS.length };
}
