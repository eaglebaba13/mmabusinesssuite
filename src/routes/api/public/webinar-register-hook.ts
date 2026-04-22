import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/webinar-register-hook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (!url || !key) return new Response("Server not configured", { status: 500 });

        const body = await request.json().catch(() => null);
        const parsed = z
          .object({ registration_id: z.string().uuid() })
          .safeParse(body);
        if (!parsed.success) return new Response("Invalid payload", { status: 400 });

        const sb = createClient(url, key);
        const { data: reg } = await sb
          .from("webinar_registrations")
          .select("id, full_name, email, phone, city, registered_at, webinar_id, webinars(id, title, scheduled_at, join_url, host_name, webhook_url)")
          .eq("id", parsed.data.registration_id)
          .maybeSingle();

        if (!reg) return new Response("Not found", { status: 404 });
        const w: any = (reg as any).webinars;
        if (!w?.webhook_url) return new Response(JSON.stringify({ skipped: true }), { status: 200 });

        try {
          await fetch(w.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "webinar.registered",
              webinar: {
                id: w.id,
                title: w.title,
                scheduled_at: w.scheduled_at,
                join_url: w.join_url,
                host_name: w.host_name,
              },
              registrant: {
                full_name: reg.full_name,
                email: reg.email,
                phone: reg.phone,
                city: reg.city,
                registered_at: reg.registered_at,
              },
            }),
          });
        } catch {
          // ignore webhook errors
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
