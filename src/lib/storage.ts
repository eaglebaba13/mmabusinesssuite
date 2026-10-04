/** Browser facade. MinIO credentials, SDK and internal endpoint are server-only. */
import { supabase } from "@/integrations/supabase/client";
import { storageBucket, storagePath, type StorageBucket } from "./storage-policy";

type Result<T> = { data: T; error: null } | { data: null; error: Error };
async function request(
  bucket: StorageBucket,
  path: string,
  init: RequestInit,
  extra: Record<string, string> = {},
) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Please sign in to access files");
  const params = new URLSearchParams({ bucket, path, ...extra });
  const response = await fetch(`/api/storage?${params}`, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers)),
      Authorization: `Bearer ${data.session.access_token}`,
    },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `File operation failed (${response.status})`);
  }
  return response;
}
async function result<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await run(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("File operation failed"),
    };
  }
}
export const storageService = {
  from(value: string) {
    const bucket = storageBucket(value);
    return {
      upload(path: string, file: Blob, options: { contentType?: string; upsert?: boolean } = {}) {
        return result(async () => {
          storagePath(path);
          await request(
            bucket,
            path,
            {
              method: "PUT",
              body: file,
              headers: {
                "Content-Type": options.contentType || file.type || "application/octet-stream",
              },
            },
            { upsert: String(options.upsert === true) },
          );
          return { path };
        });
      },
      download(path: string) {
        return result(async () =>
          (await request(bucket, storagePath(path), { method: "GET" })).blob(),
        );
      },
      createSignedUrl(path: string, expiresIn: number, options?: { download?: string | boolean }) {
        return result(async () => {
          const response = await request(bucket, storagePath(path), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operation: "signed-url",
              expiresIn,
              download: options?.download,
            }),
          });
          return (await response.json()) as { signedUrl: string; expiresAt: number };
        });
      },
      createSignedUrls(paths: string[], expiresIn: number) {
        return result(async () => {
          const entries = await Promise.all(
            paths.map(async (path) => {
              const response = await this.createSignedUrl(path, expiresIn);
              if (response.error || !response.data)
                throw response.error ?? new Error("File URL unavailable");
              return { path, ...response.data };
            }),
          );
          return entries;
        });
      },
      remove(paths: string[]) {
        return result(async () => {
          const response = await request(bucket, "", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "delete", paths }),
          });
          return (await response.json()) as { name: string }[];
        });
      },
      exists(path: string) {
        return result(async () => {
          const response = await request(bucket, storagePath(path), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "exists" }),
          });
          return (await response.json()).exists as boolean;
        });
      },
      list(prefix = "", options: { limit?: number; offset?: number } = {}) {
        return result(async () => {
          const response = await request(bucket, storagePath(prefix, true), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "list", ...options }),
          });
          return (await response.json()) as { id: string | null; name: string }[];
        });
      },
    };
  },
};
