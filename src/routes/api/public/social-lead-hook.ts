import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Public webhook to ingest leads from Meta Lead Ads, Google Ads, or any
 * external form/landing page. Calls must include either:
 *   - x-lovable-signature: HMAC-SHA256 hex of the raw body using
 *     org_settings.lead_webhook_secret, OR
 *   - ?secret=... query param matching the same secret (less safe, but
 *     useful for Zapier / Pabbly style integrations that cannot sign).
 *
 * Body shape (normalized):
 * {
 *   "source": "meta" | "google" | "manual_test" | "zapier" | "other",
 *   "campaign"?: string,
 *   "full_name": string,
 *   "email"?: string,
 *   "phone"?: string,
 *   "city"?: string,
 *   "budget"?: number,
 *   "notes"?: string,
 *   "utm"?: { source?, medium?, campaign? }
 * }
 *
 * Meta-style raw payloads (entry[].changes[].value.leadgen_id …) are not
 * resolved here — point Meta to a Zapier/Make/Pabbly that normalizes first,
 * then forwards to this URL. Keeps the webhook predictable.
 */

const payloadSchema = z.object({
  source: z.enum(["meta", "google", "manual_test", "zapier", "pabbly", "make", "other"]).default("other"),
  campaign: z.string().trim().max(200).optional(),
  ad_name: z.string().trim().max(200).optional(),
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  budget: z.number().nonnegative().optional(),
  notes: z.string().trim().max(2000).optional(),
  utm: z
    .object({
      source: z.string().trim().max(120).optional(),
      medium: z.string().trim().max(120).optional(),
      campaign: z.string().trim().max(200).optional(),
    })
    .optional(),
});

type Payload = z.infer<typeof payloadSchema>;

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length || ab.length === 0) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function mapSourceToLeadSource(s: Payload["source"]): "meta" | "google" | "manual" | "referral" | "webinar" | "website" {
  if (s === "meta") return "meta";
  if (s === "google") return "google";
  return "website";
}

export const Route = createFileRoute("/api/public/social-lead-hook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Healthcheck — handy when configuring the URL in Meta/Google
        const url = new URL(request.url);
        return new Response(
          JSON.stringify({
            ok: true,
            endpoint: "social-lead-hook",
            method: "POST",
            host: url.host,
            doc: "POST a JSON body. Auth via x-lovable-signature header (HMAC-SHA256) or ?secret=... query.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },

      POST: async ({ request }) => {
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
          return new Response("Server not configured", { status: 500 });
        }

        const sb = createClient(supabaseUrl, serviceKey);
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("x-real-ip") ||
          null;

        // Read secret from DB (single-row org_settings)
        const { data: org } = await sb
          .from("org_settings")
          .select("lead_webhook_secret")
          .eq("id", 1)
          .maybeSingle();
        const secret = org?.lead_webhook_secret ?? "";

        // Read raw body once, then validate signature, then JSON parse
        const rawBody = await request.text();
        const signatureHeader = request.headers.get("x-lovable-signature") ?? "";
        const url = new URL(request.url);
        const querySecret = url.searchParams.get("secret") ?? "";

        let signatureValid = false;
        if (secret) {
          if (signatureHeader) {
            const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
            signatureValid = safeEqualHex(signatureHeader, expected);
          } else if (querySecret) {
            // Constant-time compare via hex of utf8
            const a = Buffer.from(querySecret).toString("hex");
            const b = Buffer.from(secret).toString("hex");
            signatureValid = a.length > 0 && a === b;
          }
        }

        // Always log the attempt for auditability
        let parsed: Payload | null = null;
        let parseError: string | null = null;
        try {
          const json = JSON.parse(rawBody);
          const result = payloadSchema.safeParse(json);
          if (result.success) parsed = result.data;
          else parseError = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        } catch {
          parseError = "Body is not valid JSON";
        }

        if (!secret) {
          await sb.from("social_lead_events").insert({
            source: parsed?.source ?? "other",
            campaign: parsed?.campaign ?? null,
            payload: (parsed as unknown as object) ?? { raw: rawBody.slice(0, 4000) },
            signature_valid: false,
            status: "rejected",
            error_message: "lead_webhook_secret not configured in org_settings",
            ip_address: ip,
          });
          return new Response(
            JSON.stringify({ error: "Webhook not configured. Set a secret in Settings → Social." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }

        if (!signatureValid) {
          await sb.from("social_lead_events").insert({
            source: parsed?.source ?? "other",
            campaign: parsed?.campaign ?? null,
            payload: (parsed as unknown as object) ?? { raw: rawBody.slice(0, 4000) },
            signature_valid: false,
            status: "rejected",
            error_message: "Invalid signature",
            ip_address: ip,
          });
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!parsed) {
          await sb.from("social_lead_events").insert({
            source: "other",
            payload: { raw: rawBody.slice(0, 4000) },
            signature_valid: true,
            status: "error",
            error_message: parseError ?? "Invalid payload",
            ip_address: ip,
          });
          return new Response(JSON.stringify({ error: parseError ?? "Invalid payload" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Dedup: try to find an existing lead by email or phone within last 30 days
        const email = parsed.email && parsed.email.length > 0 ? parsed.email.toLowerCase() : null;
        const phone = parsed.phone && parsed.phone.length > 0 ? parsed.phone : null;

        let existingLeadId: string | null = null;
        if (email || phone) {
          const orFilters: string[] = [];
          if (email) orFilters.push(`email.eq.${email}`);
          if (phone) orFilters.push(`phone.eq.${phone}`);
          const { data: existing } = await sb
            .from("leads")
            .select("id")
            .or(orFilters.join(","))
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (existing?.id) existingLeadId = existing.id;
        }

        if (existingLeadId) {
          // Append an activity note instead of duplicating
          await sb.from("lead_activities").insert({
            lead_id: existingLeadId,
            activity_type: "note",
            content: `Re-engaged via ${parsed.source}${parsed.campaign ? ` (${parsed.campaign})` : ""}`,
          });
          await sb.from("social_lead_events").insert({
            source: parsed.source,
            campaign: parsed.campaign ?? null,
            payload: parsed,
            signature_valid: true,
            status: "dedup",
            lead_id: existingLeadId,
            ip_address: ip,
          });
          return new Response(JSON.stringify({ ok: true, deduped: true, lead_id: existingLeadId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // ---- Apply lead routing rules ----
        // Rules are evaluated in priority order (lowest number first). The first
        // rule whose non-null conditions ALL match wins. Empty match fields are
        // treated as wildcards.
        type Rule = {
          id: string;
          name: string;
          priority: number;
          match_source: string | null;
          match_campaign: string | null;
          match_utm_source: string | null;
          match_utm_medium: string | null;
          match_utm_campaign: string | null;
          match_city: string | null;
          match_state: string | null;
          assign_to_user: string | null;
          assign_territory_id: string | null;
          assign_franchisee_id: string | null;
          set_stage: string | null;
          add_tag: string | null;
        };

        const { data: rulesData } = await sb
          .from("lead_routing_rules")
          .select(
            "id, name, priority, match_source, match_campaign, match_utm_source, match_utm_medium, match_utm_campaign, match_city, match_state, assign_to_user, assign_territory_id, assign_franchisee_id, set_stage, add_tag",
          )
          .eq("enabled", true)
          .order("priority", { ascending: true });

        const rules = (rulesData ?? []) as Rule[];

        const ciIncludes = (haystack: string | null | undefined, needle: string | null) => {
          if (!needle) return true; // wildcard
          if (!haystack) return false;
          return haystack.toLowerCase().includes(needle.toLowerCase());
        };
        const ciEquals = (a: string | null | undefined, b: string | null) => {
          if (!b) return true;
          if (!a) return false;
          return a.trim().toLowerCase() === b.trim().toLowerCase();
        };

        // Note: match_state is reserved for future payloads that include a state field.
        // Today's payload schema only carries city, so state-only rules act as wildcards.
        const matched = rules.find((r) =>
          ciEquals(parsed.source, r.match_source) &&
          ciIncludes(parsed.campaign ?? null, r.match_campaign) &&
          ciIncludes(parsed.utm?.source ?? null, r.match_utm_source) &&
          ciIncludes(parsed.utm?.medium ?? null, r.match_utm_medium) &&
          ciIncludes(parsed.utm?.campaign ?? null, r.match_utm_campaign) &&
          ciIncludes(parsed.city ?? null, r.match_city),
        );

        // Resolve territory_id: prefer the rule's territory; otherwise look up from franchisee
        let resolvedTerritoryId: string | null = matched?.assign_territory_id ?? null;
        let resolvedFranchiseeId: string | null = matched?.assign_franchisee_id ?? null;
        if (!resolvedTerritoryId && resolvedFranchiseeId) {
          const { data: fr } = await sb
            .from("franchisees")
            .select("territory_id")
            .eq("id", resolvedFranchiseeId)
            .maybeSingle();
          resolvedTerritoryId = fr?.territory_id ?? null;
        }

        const noteParts: string[] = [];
        if (parsed.utm) {
          if (parsed.utm.source) noteParts.push(`utm_source=${parsed.utm.source}`);
          if (parsed.utm.medium) noteParts.push(`utm_medium=${parsed.utm.medium}`);
          if (parsed.utm.campaign) noteParts.push(`utm_campaign=${parsed.utm.campaign}`);
        }
        if (parsed.campaign) noteParts.push(`campaign=${parsed.campaign}`);
        if (parsed.ad_name) noteParts.push(`ad_name=${parsed.ad_name}`);
        if (matched?.add_tag) noteParts.push(`tag=${matched.add_tag}`);
        if (matched) noteParts.push(`routed_by=${matched.name}`);
        if (parsed.notes) noteParts.push(parsed.notes);

        const { data: created, error: insertErr } = await sb
          .from("leads")
          .insert({
            full_name: parsed.full_name,
            email: email ?? null,
            phone: phone ?? null,
            city: parsed.city || null,
            budget: parsed.budget ?? null,
            ad_name: parsed.ad_name ?? null,
            source: mapSourceToLeadSource(parsed.source),
            stage: (matched?.set_stage as "new" | "interested" | "followup" | "hot" | "payment_pending" | "closed" | undefined) ?? "new",
            assigned_to: matched?.assign_to_user ?? null,
            territory_id: resolvedTerritoryId,
            notes: noteParts.length > 0 ? noteParts.join(" | ") : null,
          })
          .select("id")
          .maybeSingle();

        if (insertErr || !created) {
          await sb.from("social_lead_events").insert({
            source: parsed.source,
            campaign: parsed.campaign ?? null,
            payload: parsed,
            signature_valid: true,
            status: "error",
            error_message: insertErr?.message ?? "Failed to create lead",
            ip_address: ip,
            matched_rule_id: matched?.id ?? null,
          });
          return new Response(JSON.stringify({ error: "Failed to create lead" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        await sb.from("social_lead_events").insert({
          source: parsed.source,
          campaign: parsed.campaign ?? null,
          payload: parsed,
          signature_valid: true,
          status: "created",
          lead_id: created.id,
          ip_address: ip,
          matched_rule_id: matched?.id ?? null,
          assigned_to: matched?.assign_to_user ?? null,
          assigned_territory_id: resolvedTerritoryId,
          assigned_franchisee_id: resolvedFranchiseeId,
        });

        return new Response(JSON.stringify({ ok: true, lead_id: created.id }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
