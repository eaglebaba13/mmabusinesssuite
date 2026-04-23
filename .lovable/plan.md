

# Add "Ad Name" column to Leads

Track the specific ad creative each lead came from (e.g. "Diwali Combo — Reel A", "Search — Brand Exact"). Used in the New Lead form, Kanban + Table views, exports, the import template, and the social webhook payload so Meta/Google integrations can populate it automatically.

## 1. Database

Migration adds a single nullable text column:

```sql
alter table public.leads add column ad_name text;
create index leads_ad_name_idx on public.leads (ad_name) where ad_name is not null;
```

No backfill (existing rows stay null). RLS unchanged — column inherits row-level rules.

## 2. UI — `src/routes/app.leads.tsx`

- Extend the `Lead` interface with `ad_name: string | null`.
- **Table view**: insert an "Ad Name" column between Source and Stage. Show `—` when null. Truncate long names with `max-w-[180px] truncate` + tooltip via `title=`.
- **Kanban card** (`LeadCard`): show ad name as a small dim line below the email/phone if present (`text-[10px] text-muted-foreground`).
- **Search**: include `ad_name` in the lowercase match alongside name/email/phone.
- **New Lead dialog** (`NewLeadDialog`): add an "Ad Name" input below Source (full-width). Persist on insert.

## 3. Lead detail — `src/routes/app.leads.$leadId.tsx`

Add an "Ad Name" row to the detail card (next to Source). Read-only display.

## 4. Export — same file

Add `{ header: "Ad Name", accessor: (l) => l.ad_name ?? "" }` to `exportCols` between Source and Stage so CSV and PDF reports include it.

## 5. Import template — `src/lib/import-configs.ts`

Append to `leadsConfig.columns`:
```
{ key: "ad_name", example: "Diwali Combo — Reel A", description: "Specific ad creative / ad set name" }
```
Add `ad_name: optionalString` to the schema and `ad_name: row.ad_name` in the transform. Downloadable CSV template auto-updates from this config — no separate file change.

## 6. Webhook — `src/routes/api/public/social-lead-hook.ts`

- Add `ad_name: z.string().trim().max(200).optional()` to `payloadSchema`.
- Persist `ad_name: parsed.ad_name ?? null` in the `leads` insert.
- Append `ad_name=…` to the `noteParts` audit string when present.

This means once Meta/Google integrations push payloads with `ad_name`, the column populates automatically — no further work needed there.

## Files touched

- New migration: add `ad_name` text column + index.
- `src/routes/app.leads.tsx` — type, table column, kanban line, search, new-lead form.
- `src/routes/app.leads.$leadId.tsx` — detail row.
- `src/lib/import-configs.ts` — leads config columns + schema + transform.
- `src/routes/api/public/social-lead-hook.ts` — schema + insert + note string.

No other files need updating; no existing data is affected.

