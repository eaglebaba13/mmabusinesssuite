# State Franchise Panel

## What we're building

A new **State Franchise** layer that sits above city-level Franchisees. Each state partner owns one or more `territories` (cities). When a city franchisee is created, you assign them to a territory, and the state franchise that owns that territory automatically sees:

- All franchisees running under their state
- Combined sales / POS revenue, expenses, ROI commission earned (`state_partner_pct` from revenue model)
- Lead pipeline rolled up across their cities
- Inventory snapshot across their warehouses

State franchises get their **own login** (just like city franchisees) and see a read-only state-level dashboard.

## Database changes (one migration)

1. **Add role** `state_franchisee` to `app_role` enum.
2. **New table `state_franchises`** — mirrors `franchisees` shape but for state-level partners:
   - `id`, `full_name`, `email`, `phone`, `state` (text, e.g. "Maharashtra"), `user_id`, `investment_amount`, `state_partner_pct` (default 10), `joined_at`, `status`, timestamps.
3. **Link territories → state franchise**: add `state_franchise_id uuid` column to `territories` (nullable). One state franchise owns many territories; one territory belongs to one state franchise.
4. **Credentials table** `state_franchise_credentials` (same shape as `franchisee_credentials`).
5. **RLS policies**:
   - Admin/founder/accounts: full access on `state_franchises`.
   - State franchisee self: SELECT own row by `user_id = auth.uid()`.
   - Add a SECURITY DEFINER helper `state_franchise_owns_territory(_user_id, _territory_id)` and use it to grant state franchisee SELECT on:
     - `franchisees` whose `territory_id` is in their state
     - `leads`, `lead_activities` in their territories
     - `sales_orders`, `sale_payments`, `revenue_entries`, `expenses` for those franchisees
     - `stock_levels` for warehouses linked to those franchisees
6. **Trigger** `auto_link_state_franchise_on_user_signup` — same pattern as the existing franchisee one, links by email on user creation.

No data migration needed — existing 12 territories stay as-is until you assign each to a state franchise.

## Server function

`src/server/state-franchise-user.functions.ts` — clone of `franchisee-user.functions.ts`:
- `createStateFranchiseUser` — admin-only, creates auth user, grants `state_franchisee` role, links `state_franchises.user_id`, saves temp password to `state_franchise_credentials`.
- `resetStateFranchisePassword` — admin/accounts can rotate.

## New routes

1. **`src/routes/app.state-franchises.tsx`** — admin roster page (mirrors `app.franchisees.tsx`):
   - Card grid with name, state, # cities, # franchisees, total invested.
   - "Onboard State Franchise" wizard: Partner → Commission % → Assign territories (multi-select from unassigned `territories`) → Save → Generate login (5-step flow, identical UX to city franchisee onboarding).
   - Search, date range, ImportButton, ExportBar.
2. **`src/routes/app.state-franchises.$stateFranchiseId.tsx`** — admin detail page:
   - Header with name/state/status, edit, reset password, "Open dashboard" (opens state dashboard in new tab with `as_state_franchise=1` for impersonation, same pattern as `FranchiseeActions`).
   - Tabs: Overview (KPIs), Territories (list + assign/unassign), Franchisees (city partners under this state), Sales (rolled up POS + revenue_entries), Commission ledger (computed: their `%` × sales of each city franchisee per `revenue_model_items.state_partner_pct`).
3. **`src/routes/app.my-state.tsx`** — state-franchisee-only own dashboard (mirrors `app.my-franchise.tsx`):
   - Tabs: Dashboard | Franchisees | Leads | Sales | Commission.
   - Read-only views; same styling as `FranchiseeDashboard`.

## Sidebar + auth + routing

- `AppSidebar.tsx`: add **"State Franchises"** link (admins/accounts) under Operations group; for state franchisees, show a **"My State"** group with Dashboard/Franchisees/Leads/Sales tabs pointing to `/app/my-state`.
- `auth-context.tsx`: add `"state_franchisee"` to `AppRole` union.
- `app.index.tsx`: route state-franchisee-only users to `/app/my-state`.
- `app.settings.team.tsx`: include `state_franchisee` in role picker.
- `FranchiseeActions.tsx`: keep as-is. Add a parallel `StateFranchiseActions.tsx` for the new roster.

## Onboarding flow (city franchisee tie-in)

In the existing `app.franchisees.tsx` onboarding wizard step 1, add an optional **Territory** dropdown (already in DB). When admin picks a territory, the city franchisee inherits its `state_franchise_id` automatically (via territory join), so the state franchise's dashboard immediately shows the new city.

## Commission computation

State franchise commission = sum over each city franchisee in their state of:
`(sales_orders.grand_total) × (state_partner_pct / 100)`
where `state_partner_pct` comes from the matching `revenue_model_items` row (POS line's product → category → model item), with a fallback to `state_franchises.state_partner_pct` (default 10%) if no model item match.

For the first cut we use the **flat fallback %** to keep it shipping fast; per-product computation can be a follow-up once the revenue-model → product mapping is locked in.

## What doesn't change

- City franchisee dashboards, POS, inventory, finance pages — unchanged.
- Existing 4 franchisees keep working; you can backfill their `territory_id` later from the franchisees roster.
- No breaking RLS changes — only additive policies for the new role.

## Files touched

```text
NEW  supabase/migrations/<timestamp>_state_franchise.sql
NEW  src/server/state-franchise-user.functions.ts
NEW  src/routes/app.state-franchises.tsx
NEW  src/routes/app.state-franchises.$stateFranchiseId.tsx
NEW  src/routes/app.my-state.tsx
NEW  src/components/app/StateFranchiseActions.tsx
EDIT src/components/app/AppSidebar.tsx          (add nav)
EDIT src/lib/auth-context.tsx                   (add role)
EDIT src/routes/app.index.tsx                   (redirect)
EDIT src/routes/app.settings.team.tsx           (role label)
EDIT src/routes/app.franchisees.tsx             (territory picker in wizard)
```

## Result

- Admin sees new "State Franchises" section, onboards a state partner (e.g. "ABC Holdings — Maharashtra"), assigns Mumbai Metro + Pune territories to them, generates login.
- State partner logs in → lands on `/app/my-state` → sees both city franchisees, combined sales, leads, and commission earned.
- Any new city franchisee assigned to one of their territories shows up automatically.
