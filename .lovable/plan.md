

# Franchisee Portal — Separate Login Dashboard + Onboarding Spec

The franchisee `remedystore01` is currently seeing the **Master Dashboard** ("Empire at a glance") because `/app` redirects everyone to `/app/dashboard` and that page has no role guard. We'll fully separate the franchisee experience and capture the new onboarding spec (₹5L fee, 3% ROI, equipment requirements, login credentials).

## What franchisees will see (after fix)

When a franchisee logs in, they will land directly on **My Franchise** — never the Master Dashboard. They will see:

- Their own revenue, ROI paid, pending payouts, POS sales (already built)
- Their P&L summary (revenue − expenses − ROI paid)
- Stock inventory of their dark store
- Academy batch performance attributable to them
- Equipment & infrastructure compliance checklist
- Their ROI structure card (Fee ₹5,00,000 · 3% fixed ROI · 10% Emporium · 3% Academy · 3% Dark Store)

The Master Dashboard, Leads, full Franchisees roster, Finance, etc. will be **blocked** for the `franchisee` role.

## Plan

### 1. Route guards — stop franchisees seeing Master Dashboard

- **`/app/index.tsx`**: redirect franchisees → `/app/my-franchise`, others → `/app/dashboard`.
- **`/app/dashboard`**, **`/app/franchisees`**, **`/app/leads`**, **`/app/finance`**, **`/app/hr`**, **`/app/settings`**: add a `beforeLoad` / role check that redirects the `franchisee` role to `/app/my-franchise`.
- Top bar search ("Search leads, franchisees, tickets…") will be hidden for the franchisee role (it leaks admin scope).

### 2. Capture onboarding spec in the database

New migration adds franchisee operational fields:

```text
franchisees + columns:
  franchise_fee numeric default 500000
  base_roi_pct numeric default 3.00
  emporium_pct numeric default 10.00
  academy_pct numeric default 3.00
  dark_store_pct numeric default 3.00
  area_sqft numeric
  chairs int default 2
  tables int default 1
  cctv_count int default 1
  computer_count int default 1
  printer_count int default 1
  equipment_verified bool default false
  equipment_verified_at timestamptz
```

A second table `franchisee_credentials` (admin-only RLS) stores the **generated email + temporary password** issued at onboarding so admins can hand them to the partner.

### 3. Upgrade onboarding flow (admin side)

The "Onboard" dialog on `/app/franchisees` will be expanded to a 3-step form:

1. **Partner details** — name, email, phone, territory
2. **Investment & ROI** — Franchise fee (default ₹5L), Base ROI %, incentive %s
3. **Premises & equipment** — Area (sq ft, min 150), chairs, table, CCTV, computer, printer checklist
4. **Login** — auto-generates an email (e.g. `partner_<phone>@franchisee.mma`) + 12-char password, calls a server function to (a) create the auth user, (b) assign `franchisee` role, (c) link `franchisees.user_id`, (d) save credentials in `franchisee_credentials` so the admin can copy & share

### 4. Build the dedicated franchisee dashboard

`/app/my-franchise` already shows revenue/orders/payouts. We'll add:

- **Hero card**: ROI structure (3% fix + 10/3/3 incentives), franchise fee paid, equipment compliance badge
- **P&L block**: This month + lifetime (revenue − expenses − ROI paid out)
- **Inventory snapshot**: stock levels for products tagged to this franchisee's warehouse (read-only)
- **Academy performance**: batches/students under their territory with completion %
- **Equipment checklist**: ticked items with "✓ Verified by admin" timestamp

### 5. Sidebar cleanup for franchisee role

Franchisee sidebar will only show:
- My Franchise (dashboard)
- My Inventory (read-only stock view)
- Academy Performance (read-only)
- Support
- Settings (profile only — change password)

The "Operations / Academy / Inventory / Finance / Marketing / Sales" groups will be hidden for franchisees.

## Technical details

- **Files created**: `src/routes/app.my-franchise.tsx` (rewrite with new sections), `src/routes/api/admin/create-franchisee-user.ts` (server route to create auth user + role + link), one migration file.
- **Files edited**: `app.tsx` (role-based default landing), `app.dashboard.tsx` / `app.leads.tsx` / `app.franchisees.tsx` / `app.finance.tsx` / `app.hr.tsx` (add `beforeLoad` redirect for franchisee role), `AppSidebar.tsx` (franchisee-only nav), `app.franchisees.tsx` (multi-step onboarding form), `TopBar.tsx` (hide global search for franchisee), `FranchiseeDashboard.tsx` (add P&L, inventory, academy, equipment sections, ROI structure card).
- **Auth user creation**: uses Supabase Admin API inside a server function with the service role key (already available via Lovable Cloud). The temp password is shown **once** in the onboarding dialog and stored hashed in `franchisee_credentials.temp_password` (encrypted at rest, viewable only by `super_admin`/`accounts`).
- **RLS**: existing franchisee RLS already restricts row-level data to `user_id = auth.uid()`. We'll add similar policies for the new `inventory_warehouses`/`stock_movements` reads scoped by `franchisee_id`.

After approval I'll run the migration, build the new dashboard sections, and ship the role-aware routing in one pass.

