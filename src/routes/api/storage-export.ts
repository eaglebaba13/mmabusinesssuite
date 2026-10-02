import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/storage-export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Sign in required" }, { status: 401 });
        }

        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) {
          return Response.json({ error: "Storage export is not configured" }, { status: 500 });
        }

        const token = authHeader.slice("Bearer ".length);
        const userClient = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsError || !userId) {
          return Response.json({ error: "Session invalid" }, { status: 401 });
        }

        const { data: isSuperAdmin, error: roleError } = await userClient.rpc("has_role", {
          _user_id: userId,
          _role: "super_admin",
        });
        if (roleError || !isSuperAdmin) {
          return Response.json({ error: "Super Admin access required" }, { status: 403 });
        }

        try {
          const { createCompleteStorageZip } = await import("@/lib/storage-export.server");
          const { bytes, fileCount, bucketCount } = await createCompleteStorageZip();
          const date = new Date().toISOString().slice(0, 10);
          const filename = `mma-complete-storage-${date}.zip`;

          return new Response(bytes, {
            status: 200,
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Content-Length": String(bytes.byteLength),
              "Cache-Control": "private, no-store",
              "X-Archive-Files": String(fileCount),
              "X-Archive-Buckets": String(bucketCount),
            },
          });
        } catch (error) {
          console.error("Complete storage export failed", error);
          return Response.json(
            { error: "The ZIP could not be completed. No partial archive was downloaded." },
            { status: 500, headers: { "Cache-Control": "private, no-store" } },
          );
        }
      },
    },
  },
});