
# MMA Business Suite — Phase 1 (Approved Build Plan)

Building the luxury Noir & Gold foundation: marketing site + auth + Master Dashboard + Lead CRM + Franchisee module, with real Lovable Cloud backend and seeded demo data.

## Design system
- **Palette:** Black `#0d0d0d`, charcoal `#1a1a1a`, gold `#c9a84c`, soft gold `#f0d78c`, ivory text `#f5f3ee`
- **Typography:** Playfair Display (headings) + Inter (body)
- **Style:** Glassmorphism cards, gold hairline borders, subtle gold glow on hover, smooth Framer Motion transitions, dark-first
- **Components:** Premium KPI cards, Recharts for graphs, shadcn data tables, Kanban via dnd-kit

## Routes (TanStack file-based, each with own head/meta)
```
/                    Landing page (hero, modules, social proof, CTA)
/pricing             3 tiers — Starter / Growth / Enterprise White-Label
/login               Email + password
/signup              Account creation
/app                 Authenticated layout (sidebar + topbar + Outlet)
/app/dashboard       Master Dashboard (KPIs, charts, leaderboard)
/app/leads           Lead CRM (table + Kanban toggle)
/app/leads/$leadId   Lead detail drawer/page
/app/franchisees     Franchisee directory
/app/franchisees/$id Franchisee profile + ROI ledger
/app/my-franchise    Franchisee's own dashboard (when logged in as franchisee)
/app/settings        Org info, profile, branding placeholders
/app/support         Tickets list
```

## Database (Lovable Cloud + RLS on every table)
- `profiles` — links to `auth.users`, basic user info
- `app_role` enum: `super_admin`, `founder`, `franchisee`, `sales`, `accounts`, `inventory`, `academy_admin`, `webinar`, `hr`, `white_label`, `trainer`, `support`, `package_sales`
- `user_roles` + `has_role(uuid, app_role)` security-definer function
- `audit_logs` — all sensitive actions
- `territories` — state/region
- `leads` — contact, source, stage, score, assigned_to, territory_id
- `lead_activities` — notes, calls, status changes, followup reminders
- `franchisees` — investor info, fee, join date, territory, status
- `roi_payouts` — month, base ROI 3%, incentives breakdown, status
- `incentives` — emporium 10% / academy 3% / dark store 3%
- `documents` — agreements, KYC (Cloud Storage)
- `tickets` + `ticket_messages`
- `notifications`
- `org_settings` — single row, branding placeholders

RLS: super_admin/founder see all; franchisees see only their own rows; sales sees assigned leads; etc.

## Module details

### Landing page
Hero with gold-on-black headline, animated KPI strip, business model cards (Franchise / Academy / Emporium / Webinar / White Label), testimonial quotes, pricing teaser, CTA. Replaces placeholder index.

### Auth
- Lovable Cloud email+password
- Auto-create profile via trigger
- After signup: assigns default role
- Super admin can change roles in Settings

### Master Dashboard
KPI cards: Total Revenue, MRR, Franchise Fees, Total Leads, Closing Ratio, Net Profit, Active Franchisees, Pending ROI Payouts.
Charts: Monthly revenue line, sales-by-source donut, state-wise bar, sales-team leaderboard table.
All driven by real seeded data via TanStack Query.

### Lead CRM
- Table view (sortable, filterable, search) + Kanban view toggle
- Pipeline: New → Interested → Followup → Hot → Payment Pending → Closed → Lost
- Drag-to-move stages (writes to DB)
- Add/edit lead modal, CSV import (client-side parse)
- Lead detail: timeline, notes, followup scheduler, activity log
- AI lead score column (Lovable AI Gateway, on-demand button per lead)
- Source tracking, territory & rep assignment

### Franchisee module
- Directory with status, territory, investment, lifetime ROI paid
- Profile page: investment ledger, monthly ROI history, incentives breakdown, documents vault, tickets
- "Mark payout done" action for accounts role
- Franchisee self-view (`/app/my-franchise`): same data scoped to themselves via RLS

### Shared chrome
- Collapsible luxury sidebar (gold accent on active route)
- Topbar: global search, notifications bell, profile menu, theme toggle
- Toaster for actions
- Role-aware nav (hides modules user can't access)

## Seed data
- 1 super admin (uses signup), 2 founders, 5 sales reps, 8 franchisees, 3 accounts users
- 200 leads across all stages, 6 sources, 12 territories
- 8 franchisees with 6 months of ROI history + incentives
- 15 sample tickets, 30 notifications

## Tech notes
- TanStack Start routes with per-route `head()` meta
- TanStack Query for all data fetching, QueryClient via router context
- Framer Motion for page transitions and card hovers
- Recharts for all graphs styled to gold/dark theme
- dnd-kit for Kanban
- Zod for form validation, react-hook-form for forms
- Every loader route gets `errorComponent` + `notFoundComponent`

## Out of scope (Phase 2/3)
Academy, Inventory, Finance, Webinar, HR, white-label multi-tenancy, Razorpay/WhatsApp/Meta/Zoom integrations, full automation engine, AI Suite (beyond lead scoring), super-admin impersonation, landing page builder.

## Done criteria
Sign up → land on luxury dashboard with real KPIs → manage 200 seeded leads via Kanban → onboard a franchisee → log out, log back in as that franchisee → see scoped ROI dashboard. Looks like a ₹100Cr product.
