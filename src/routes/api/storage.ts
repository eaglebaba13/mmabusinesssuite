import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const { createStorageHandler } = await import("@/lib/storage-handler.server");
  return createStorageHandler()(request);
}
export const Route = createFileRoute("/api/storage")({
  server: { handlers: { GET: handle, HEAD: handle, PUT: handle, POST: handle } },
});
