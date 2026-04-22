

# Combined Plan: Franchisee Controls + Dashboard Upgrades

Two approved scopes merged into one implementation pass.

## Part A — Franchisee click-through + Edit / Activate / Deactivate / Reset

### A1. Card-level quick actions (`/app/franchisees`)
Add a 3-dot dropdown in the top-right of each card (absolute-positioned, `e.stopPropagation()` so the card link still works for the rest of the surface):
- Open dashboard · Edit profile · Activate / Deactivate · Reset password · Delete (super_admin only)

Inactive cards are dimmed; status badge turns muted/red.

### A2. Detail page header (`/app/franchisees/$franchiseeId`)
Sticky strip above the existing tabs: avatar + name + email + status pill on the left; **Edit · Activate/Deactivate · Reset password** buttons on the right (super_admin/accounts only). Plus a "View as partner" link for super_admin.

### A3. Shared `FranchiseeEditDialog`
Tabbed dialog reused by card menu and detail header:
- **Partner** — full_name, email, phone, notes
- **ROI** — franchise_fee, base_roi_pct, emporium_pct, academy_pct, dark_store_pct
- **Premises** — area_sqft, chairs, tables, cctv, computer, printer
- **Access** — login email (read-only), Reset password button, last sign-in time

Saves via `supabase.from("franchisees").update(...)` + React Query invalidation.

### A4. Activate / Deactivate behavior
Single mutation flips `franchisees.status`. When `inactive`:
- Login still works, but `/app/my-franchise` shows an "Account paused — contact admin" banner
- Excluded from new lead routing (filter `status = 'active'` in routing queries)

### A5. Reset password
New server fn `resetFranchiseePassword` in `src/server/franchisee-user.functions.ts` — admin-only, generates a new temp password via `supabase.auth.admin.updateUserById({ password })`, returns it once for display.

### A6. Permissions
Edit / Activate / Deactivate / Reset → super_admin + accounts. Delete → super_admin only. Franchisee role → read-only (no buttons rendered).

---

## Part B — Dashboard upgrades

### B1. Hide zero-percent ROI blocks
In `FranchiseeDashboard.tsx`, filter the "Your ROI structure" array so any block with `0%` is omitted. Grid auto-adjusts to 1–4 columns. If all four are zero, hide the entire panel.

### B2. Auto lead sync from ads (hourly) + CSV download

**Edge function** `supabase/functions/sync-ad-leads/index.ts`:
- Reads OAuth tokens from `social_integrations.credentials` (jsonb)
- Pulls leads + active campaigns from Meta / Google / Instagram per integration
- Upserts into `leads`, `social_lead_events`, `ad_campaigns`
- Updates `social_integrations.last_sync_at / last_sync_status / last_sync_error`
- Each platform wrapped in try/catch — one failing platform doesn't block others

**`pg_cron` hourly schedule** — idempotent (drops job before re-creating):
```
select cron.schedule('sync-ad-leads-hourly', '0 * * * *',
  $$ select net.http_post('<edge-fn-url>', '{}', 'application/json') $$);
```

**UI in `FranchiseeLeadsPanel.tsx`**:
- "Last synced: 12 min ago" pill
- **Download CSV** button — client-side `Blob`, exports currently filtered leads as `leads-{name}-{date}.csv` (Name, Phone, Email, Source, Campaign, Stage, Score, Created)
- "Sync now" button (admin only) — calls the edge function on demand

### B3. Live campaign previews

**New table `ad_campaigns`** with RLS scoped by `franchisee_id` or `territory_id`:
```text
id uuid pk · source text · external_id text · name text
status text · preview_url text · headline text · body text · cta_url text
territory_id uuid · franchisee_id uuid · spend_total numeric · last_synced_at timestamptz
```

**New columns on `social_integrations`**: `last_sync_at`, `last_sync_status`, `last_sync_error`.

**`ActiveCampaignsGrid.tsx`** — responsive 1/2/3-col grid of campaign tiles (source pill, name, thumbnail, status dot, headline+body, "View on platform" CTA, leads-7d + conversion %). Sits at the top of the Campaigns tab. Empty state: "No active campaigns running. Connect ad accounts in Settings → Social to auto-import."

---

## Files

**Migration** (one file):
- `social_integrations`: add `last_sync_at`, `last_sync_status`, `last_sync_error`
- Create `ad_campaigns` + RLS (franchisee scoped, admin full)
- Schedule `pg_cron` hourly job (drop-then-create)

**Edge function** (create):
- `supabase/functions/sync-ad-leads/index.ts`

**Create**:
- `src/components/app/FranchiseeEditDialog.tsx`
- `src/components/app/FranchiseeActions.tsx`
- `src/components/app/ActiveCampaignsGrid.tsx`
- `src/lib/leads-export.ts`

**Edit**:
- `src/routes/app.franchisees.tsx` — add `<FranchiseeActions />` to cards, dim inactive
- `src/routes/app.franchisees.$franchiseeId.tsx` — add sticky header strip with action buttons
- `src/routes/app.my-franchise.tsx` — paused-account banner when status = inactive
- `src/components/app/FranchiseeDashboard.tsx` — filter zero ROI blocks, dynamic grid
- `src/components/app/FranchiseeLeadsPanel.tsx` — sync pill, CSV button, admin "Sync now"
- `src/components/app/FranchiseeCampaignsPanel.tsx` — mount `<ActiveCampaignsGrid />` on top
- `src/server/franchisee-user.functions.ts` — add `resetFranchiseePassword`

## Technical notes
- Card dropdown uses `e.preventDefault(); e.stopPropagation()` so the wrapping `<Link>` doesn't fire.
- Edit/Reset/Delete buttons gated by `useAuth().isAdmin || hasRole("accounts")`; Delete by `hasRole("super_admin")` only.
- CSV: pure client-side `Blob` + `URL.createObjectURL` (no server roundtrip).
- Campaign previews use platform-hosted `preview_url` (no re-hosting). Stale URLs auto-refresh on next sync.
- Realtime already covers new lead inserts — no extra subscriptions needed for sync results to appear live.

After approval I'll run the migration, deploy the edge function with the cron schedule, then ship all UI changes (controls + dashboard upgrades) in one pass.

