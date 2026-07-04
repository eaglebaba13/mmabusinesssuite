import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

function checkSecret(request: Request): boolean {
  const expected = process.env.WEBINAR_CRON_SECRET;
  if (!expected) return false;
  const provided =
    request.headers.get("x-webhook-secret") ??
    new URL(request.url).searchParams.get("secret") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/webinar-reminders")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  if (!checkSecret(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "Server not configured" }), { status: 500 });
  }
  const sb = createClient(url, key);
  const now = new Date();

  // Fetch upcoming webinars in next 25h that still need a 24h or 1h reminder
  const horizon = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();
  const { data: webinars } = await sb
    .from("webinars")
    .select("id, title, scheduled_at, join_url, host_name, webhook_url, reminder_24h_sent_at, reminder_1h_sent_at")
    .in("status", ["scheduled", "live"])
    .lte("scheduled_at", horizon)
    .gte("scheduled_at", now.toISOString());

  let dispatched = 0;
  const results: Array<{ webinar_id: string; kind: string; ok: boolean }> = [];

  for (const w of webinars ?? []) {
    const minsUntil = (new Date(w.scheduled_at).getTime() - now.getTime()) / 60000;

    const kinds: Array<"24h" | "1h"> = [];
    if (minsUntil <= 24 * 60 + 30 && minsUntil > 60 && !w.reminder_24h_sent_at) kinds.push("24h");
    if (minsUntil <= 60 && minsUntil > 0 && !w.reminder_1h_sent_at) kinds.push("1h");

    if (!kinds.length) continue;

    const { data: regs } = await sb
      .from("webinar_registrations")
      .select("id, full_name, email, phone, reminded_24h_at, reminded_1h_at")
      .eq("webinar_id", w.id);

    for (const kind of kinds) {
      const filtered = (regs ?? []).filter((r) =>
        kind === "24h" ? !r.reminded_24h_at : !r.reminded_1h_at,
      );

      if (w.webhook_url && filtered.length) {
        try {
          await fetch(w.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: `webinar.reminder.${kind}`,
              webinar: {
                id: w.id,
                title: w.title,
                scheduled_at: w.scheduled_at,
                join_url: w.join_url,
                host_name: w.host_name,
              },
              recipients: filtered.map((r) => ({
                full_name: r.full_name,
                email: r.email,
                phone: r.phone,
              })),
            }),
          });
        } catch {
          // swallow webhook errors; still mark sent to avoid retry storm
        }
      }

      const ids = filtered.map((r) => r.id);
      if (ids.length) {
        const patch = kind === "24h"
          ? { reminded_24h_at: now.toISOString() }
          : { reminded_1h_at: now.toISOString() };
        await sb.from("webinar_registrations").update(patch).in("id", ids);
      }

      const wPatch = kind === "24h"
        ? { reminder_24h_sent_at: now.toISOString() }
        : { reminder_1h_sent_at: now.toISOString() };
      await sb.from("webinars").update(wPatch).eq("id", w.id);

      dispatched += filtered.length;
      results.push({ webinar_id: w.id, kind, ok: true });
    }
  }

  return new Response(JSON.stringify({ dispatched, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
