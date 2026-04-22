

# Franchisee Login → Live, Self-Scoped Dashboard

## The bug you're seeing right now

`remedystore01@gmail.com` is logged in with the `franchisee` role, but `/app/my-franchise` shows **"No franchise on record"**. Reason: the `franchisees` row for "Sidhhartha" exists with the same email, but its `user_id` column is `NULL` — the onboarding wizard saved credentials and created the auth user, but the link step didn't bind because the row was created earlier without going through the wizard. Same problem for the other 9 seed franchisees.

## Plan

### 1. Auto-heal the link (one-time + future-proof)

- Migration: backfill `franchisees.user_id` for any row where `user_id IS NULL` and `lower(franchisees.email) = lower(auth.users.email)`. This fixes Sidhhartha and the 9 other seed records immediately.
- Add a database trigger on `auth.users` (after insert) that auto-links a new franchisee user to a matching `franchisees` row by email if `user_id` is null. Future logins created outside the wizard will self-bind.
- `/app/my-franchise` fallback: if `user_id` lookup misses, also try `email = auth.user.email` so the page never shows "No franchise on record" when a row clearly exists.

### 2. Confirm "only their own data" (RLS audit)

Verify and tighten RLS on every table the dashboard reads, scoped to `franchisees.user_id = auth.uid()`:
- `franchisees` · `revenue_entries` · `sales_orders` · `expenses` · `roi_payouts` · `franchisee_targets` · `stock_levels` (via linked `warehouse_id`) · `leads` (via `territory_id`) · `lead_activities`
- For each, ensure SELECT policy is: row's `franchisee_id` (or derived) belongs to a franchisee where `user_id = auth.uid()`. Migration adds/replaces the missing policies.

### 3. New franchisee-only sections on `/app/my-franchise`

The dashboard already shows revenue, P&L, ROI, POS sales, equipment, inventory. Add three new live blocks scoped to **their** franchisee only:

- **My Leads** — table of leads from `leads` joined on the franchisee's `territory_id` (from `franchisees.territory_id`). Columns: name, phone, source, stage, score, created. Read-only. Click → small drawer with activity timeline. Stage filter chips (New / Contacted / Qualified / Won / Lost) + counts.
- **My Ads & Campaigns** — pulls from `social_lead_events` filtered to leads in their territory; shows last 30 days: ad source (Meta / Google / Instagram), leads generated, cost-per-lead (if `spend` field present), conversion %. If the table has no `spend` column we show only volume + conversion.
- **Account update timeline** — single feed: newest 25 events across `lead_activities`, `revenue_entries`, `sales_orders`, `roi_payouts`, `expenses` for this franchisee, so they can see "kaha tak update hua hai" at a glance.

### 4. Sidebar additions for franchisee role

Add three read-only entries under the existing "Franchisee" group: **My Franchise** (existing) · **My Leads** · **My Campaigns**. Both new entries point to in-page tabs on `/app/my-franchise` (`?tab=leads` / `?tab=campaigns`) so we don't need new protected routes — keeps RBAC simple.

### 5. Realtime sync (live data, no refresh)

Subscribe via Supabase Realtime in `FranchiseeDashboard` for `revenue_entries`, `sales_orders`, `roi_payouts`, `leads` filtered by `franchisee_id` / `territory_id` → on event, invalidate the matching React Query keys. Dashboard updates within ~2s when admins record new revenue/orders/payouts or when a new lead lands in their territory.

### 6. Admin click-through stays the same

Admin `/app/franchisees/$id` already renders the same `FranchiseeDashboard` component → admins automatically get all new sections (Leads, Campaigns, Timeline) for any franchisee they click.

## Files

**Migration** (one file):
- Backfill `franchisees.user_id` by email
- Trigger `auto_link_franchisee_on_user_signup`
- RLS audit / add missing policies for `leads`, `lead_activities`, `social_lead_events`, `stock_levels`, `franchisee_targets`

**Edit:**
- `src/routes/app.my-franchise.tsx` — add tabs (Dashboard / Leads / Campaigns / Timeline) + email-fallback lookup
- `src/components/app/FranchiseeDashboard.tsx` — add Realtime subscriptions, "Account update timeline" feed
- `src/components/app/AppSidebar.tsx` — add "My Leads" and "My Campaigns" entries for franchisee role

**Create:**
- `src/components/app/FranchiseeLeadsPanel.tsx` — leads list scoped by territory
- `src/components/app/FranchiseeCampaignsPanel.tsx` — ads/source breakdown from `social_lead_events`
- `src/components/app/FranchiseeTimeline.tsx` — unified activity feed

After approval I'll run the migration first (so Sidhhartha sees their data on the very next refresh), then ship the three new panels and Realtime sync in one pass.

