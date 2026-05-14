
# MMA Suite – Business OS — Phase 1 Plan

Approach: **Hybrid** — keep existing 51 tables intact, add missing tables/columns, redesign sidebar + dashboards + permission layer per spec. Live data stays; new demo data carries `is_demo = true`.

---

## 1) Current Module Audit

| Spec module | Status in current app | Gap |
|---|---|---|
| Master Dashboard | `app.dashboard.tsx` (admin), `FranchiseeDashboard` | KPIs partially live; missing: company-level rollups, payouts trend, receivables/payables aging, MRR, top-states/cities tables |
| Leads CRM + Franchise Pipeline | `leads`, `lead_activities`, `lead_routing_rules` ✓ | Convert-to-Franchise action, Kanban view, duplicate detection missing |
| State Franchises | Table + routes exist; basic onboarding ✓ | ROI ledger, ₹1.5L activation incentive, 10% turnover, 7% student margin, payout statements **missing** |
| City Franchises | `franchisees` table + ROI percentages (3/10/3/3) ✓ | ROI/incentive **ledger** + payout approval workflow missing |
| Academies | `students`, `enrollments`, `fee_payments`, `batches`, `courses`, `trainers`, `certificates`, `attendance` ✓ | Academy-scoped role + dashboard portal missing |
| Dark Stores | Modeled as `warehouses` linked to franchisee ✓ | Entity type + dedicated dashboard/portal missing |
| Nail Emporium / X Nail Bar | Role `nail_emporium` exists; no branch entity | **Salon branch table + service catalog + branch P&L missing** |
| Customers / Vendors | `suppliers` ✓; no customers table | Customer master missing (POS currently stores customer inline) |
| Products / Inventory / Purchases | Full set ✓ | OK |
| Billing / Invoices | `sales_orders` (single company) | **Multi-company chain HDK→MOS→Nail Emporium→downstream missing**, no proforma/credit/debit note types, no inter-company invoices |
| Payments | `sale_payments` only | Generic payments table (across companies, AR/AP) missing |
| Payouts / ROI / Incentives | `roi_payouts` table ✓, `franchisee_targets` ✓ | State-side payout ledger + rule engine + approval workflow missing |
| Accounts Department | `accounts` role exists, finance routes ✓ | Dedicated department dashboard + correction/cancellation workflow missing |
| Reports Center | None | **Entire module missing** |
| Documents | None | Missing |
| Support Tickets | `tickets` table ✓ | OK |
| Users & Roles | `user_roles`, `app_role` enum (15 values) ✓ | Missing: `academy_user`, `dark_store_user`, `salon_branch_user`, `city_franchisee` (current uses `franchisee`); permission matrix missing |
| Audit Logs | `audit_logs` table ✓ | Module-level UI viewer + impersonation events missing |
| Impersonation | None | **Entire system missing** |

---

## 2) Phase 1 — Foundation (this iteration)

### 2.1 Database schema deltas

```sql
-- New enums
CREATE TYPE entity_type AS ENUM (
  'company','state_franchise','city_franchise','academy',
  'dark_store','salon_branch','department'
);
CREATE TYPE company_type AS ENUM ('group','distributor','retailer','operator');
CREATE TYPE invoice_doc_type AS ENUM (
  'b2b_tax','b2c','proforma','quotation','receipt','credit_note','debit_note'
);
CREATE TYPE impersonation_mode AS ENUM ('read_only','read_write');

-- Add missing role values
ALTER TYPE app_role ADD VALUE 'academy_user';
ALTER TYPE app_role ADD VALUE 'dark_store_user';
ALTER TYPE app_role ADD VALUE 'salon_branch_user';
ALTER TYPE app_role ADD VALUE 'auditor';

-- Demo-data flag on all new tables; backfill flag on key existing tables
ALTER TABLE state_franchises ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE franchisees      ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

-- Multi-company billing chain
CREATE TABLE companies (
  id uuid PK, name text, legal_name text, gstin text, pan text,
  company_type company_type, parent_company_id uuid, brand text,
  address jsonb, invoice_prefix text, is_demo bool, ...
);
-- Seed: HDK BEAUTY I PVT LTD, MOS, Nail Emporium, X Nail Bar

CREATE TABLE invoice_numbering_rules (
  id, company_id, doc_type invoice_doc_type, prefix text,
  financial_year text, current_seq int, format text
);

CREATE TABLE invoices (
  id, company_id (from), bill_to_company_id, bill_to_entity_type entity_type,
  bill_to_entity_id, doc_type invoice_doc_type, invoice_number,
  invoice_date, due_date, subtotal, gst_total, grand_total, amount_paid,
  payment_status, status (draft/issued/cancelled/revised),
  parent_invoice_id (for credit/debit notes & revisions), revision_no,
  cancellation_reason, notes, is_demo
);
CREATE TABLE invoice_items (id, invoice_id, product_id?, description,
  qty, unit_price, discount_pct, gst_pct, line_total);

CREATE TABLE payments (
  id, direction ('in'/'out'), company_id, counterparty_entity_type,
  counterparty_entity_id, invoice_id?, amount, payment_date,
  method, reference, status, is_demo
);

-- Salon branches (X Nail Bar)
CREATE TABLE salon_branches (
  id, name, code, city, state, territory_id?, manager_user_id?,
  parent_brand ('nail_emporium' | 'x_nail_bar'), status,
  service_catalog jsonb, is_demo
);
ALTER TABLE sales_orders ADD COLUMN salon_branch_id uuid;
ALTER TABLE sales_orders ADD COLUMN company_id uuid;

-- State Franchise ledgers (NEW)
CREATE TABLE state_franchise_roi_ledger (
  id, state_franchise_id, period_month date, basis_amount numeric,
  roi_pct numeric DEFAULT 3, roi_due numeric, status, paid_at, paid_amount, notes
);
CREATE TABLE state_franchise_incentive_ledger (
  id, state_franchise_id, kind ('city_activation','state_turnover','student_margin'),
  related_entity_type entity_type, related_entity_id uuid,
  basis_amount numeric, pct numeric, amount numeric,
  period_month date, status ('accrued','approved','paid'), paid_at, notes
);
CREATE TABLE state_franchise_targets (
  id, state_franchise_id, contract_year int, target_count int DEFAULT 10,
  activated_count int DEFAULT 0, per_activation_amount numeric DEFAULT 150000,
  starts_on date, ends_on date
);

-- Generic user-to-entity mapping (drives RLS + portal scope)
CREATE TABLE user_entity_access (
  id, user_id, entity_type entity_type, entity_id uuid,
  can_write bool DEFAULT false, granted_by, granted_at
);

-- Impersonation sessions
CREATE TABLE impersonation_sessions (
  id, acting_admin_id uuid, impersonated_user_id uuid,
  entity_type entity_type, entity_id uuid,
  mode impersonation_mode DEFAULT 'read_only',
  token_hash text, started_at, expires_at, ended_at,
  ip text, user_agent text
);
CREATE TABLE impersonation_audit (
  id, session_id, action text, resource text, payload jsonb, at timestamptz
);

-- Document vault
CREATE TABLE documents (
  id, entity_type, entity_id, title, doc_kind (agreement/kyc/invoice/other),
  storage_path text, uploaded_by, uploaded_at, is_demo
);
```

### 2.2 Role / Permission Matrix (Phase 1 essentials)

| Role | Master DB | Companies | State F. | City F. | Invoices | Payments | Payouts | Reports | Users | Impersonate |
|---|---|---|---|---|---|---|---|---|---|---|
| super_admin | RW | RW | RW | RW | RW | RW | RW + approve | R | RW | ✓ RW |
| founder | R | R | R | R | R | R | R + approve | R | R | ✓ RO |
| accounts | scoped | R | R | R | RW | RW | R + record | R | – | ✗ |
| sales | scoped | – | R | R | – | – | – | R (pipeline) | – | ✗ |
| state_franchisee | own state | – | own | own state cities R | own R | own R | own R | own | – | ✗ |
| franchisee (=city) | own | – | – | own | own R | own R | own R | own | – | ✗ |
| academy_user | own | – | – | – | own R | own R | – | own | – | ✗ |
| dark_store_user | own | – | – | – | own R | own R | – | own | – | ✗ |
| salon_branch_user | own | – | – | – | own R | own R | – | own | – | ✗ |
| nail_emporium | brand | – | R | R | RW | R | – | R | – | ✗ |
| auditor | R-all | R | R | R | R | R | R | R | R | ✗ |

RLS implementation uses two SECURITY DEFINER helpers (already present pattern):
- `user_has_entity(_user_id, _entity_type, _entity_id)` reading `user_entity_access`.
- `current_impersonation()` reading a JWT claim `impersonation` set by the impersonation server fn.

### 2.3 Impersonation Flow (server function)

```
Admin clicks "Open dashboard" on any entity row
  → POST /sf/impersonate.functions.ts startImpersonation({ entity_type, entity_id, mode })
  → server fn validates is_admin(auth.uid())
  → inserts impersonation_sessions row, mints JWT signed with SESSION_SECRET
     claims: { sid, acting_admin_id, entity_type, entity_id, mode, exp: now+30m }
  → returns { url: `/imp/${jwt}` }
  → Admin's browser opens new tab `/imp/{jwt}`
  → /imp route stores token in sessionStorage (NOT localStorage),
     sets ImpersonationContext, navigates to that entity's dashboard
  → All Supabase queries go via a server fn `imp.read()` that:
     - verifies JWT signature + expiry + DB session row not ended
     - uses supabaseAdmin with WHERE filters scoped to the impersonated entity
     - logs every read/write to impersonation_audit
  → Banner component renders fixed top:
     "Viewing as {entity.name} • Impersonated by {admin.name} • Expires in {mm:ss} • [Exit]"
  → Exit → endImpersonation(sid) → marks ended_at, clears sessionStorage
```

Read-write impersonation gated by `org_settings.allow_rw_impersonation` (super_admin only).

### 2.4 State Franchise ROI Engine

Monthly cron (server fn invoked nightly via `/api/public/cron/accruals` with shared-secret header):

```
For each active state_franchise sf:
  basis = sf.investment_amount
  INSERT INTO state_franchise_roi_ledger(period_month=this_month, roi_due=basis*0.03, status='accrued')

For each newly activated city_franchise in sf's state (joined_at this month):
  INSERT INTO state_franchise_incentive_ledger(
    kind='city_activation', amount=150000, basis_amount=null, status='accrued')

Monthly state turnover share (10%):
  net_turnover = SUM(invoices.grand_total WHERE bill_to_entity in sf.cities AND month)
                 - SUM(credit_notes for same)
  INSERT(kind='state_turnover', basis_amount=net_turnover, pct=10, amount=net_turnover*0.10)

Student product margin (7%):
  margin_basis = SUM(invoices for academy product lines in sf.state)
  INSERT(kind='student_margin', basis_amount=margin_basis, pct=7, amount=basis*0.07)
```

Targets: trigger on `franchisees INSERT` increments `state_franchise_targets.activated_count`.

### 2.5 Multi-company Billing Chain

```
companies seed:
  HDK BEAUTY I PVT LTD  → parent of everything
  MOS                   → parent_company_id = HDK
  Nail Emporium         → parent_company_id = MOS
  X Nail Bar (operator) → parent_company_id = Nail Emporium

Invoice numbering rules (one per company × doc_type):
  HDK/B2B_TAX → "HDK/{FY}/{0000}"
  MOS/B2B_TAX → "MOS/{FY}/{0000}"
  NE/B2B_TAX  → "NE/{FY}/{0000}"
  NE/B2C      → "NE-BC/{FY}/{0000}"
  …

Flow:
  HDK issues invoice → MOS (AP for MOS / AR for HDK)
  MOS issues invoice → Nail Emporium
  Nail Emporium issues invoice → Academy / DarkStore / SalonBranch / Customer
  Each invoice has bill_to_entity_type so receivables/payables aging
  rolls up by entity type and by company.

Credit/debit notes reference parent invoice; "Revise" creates revision_no+1 and
links parent_invoice_id; original is marked status='revised'.
```

### 2.6 Sidebar redesign

Reorganize `AppSidebar.tsx` into groups (role-filtered):

```
Overview          : Master Dashboard, Reports Center
Sales & CRM       : Leads, Franchise Pipeline
Network           : State Franchises, City Franchises, Academies, Dark Stores,
                    Nail Emporium, X Nail Bar Branches
Operations        : POS, Inventory, Products, Purchases, Customers, Vendors
Finance           : Companies, Billing/Invoices, Payments, Payouts,
                    ROI & Incentives, Accounts Department, Expenses, Revenue Model
People            : HR, Academy (admin), Webinars, Support
Governance        : Users & Roles, Audit Logs, Documents, Settings
My Portal         : (entity users see their own scoped section here)
```

### 2.7 Files plan (Phase 1)

```
NEW supabase/migrations/<ts>_phase1_foundation.sql        (all schema above)
NEW src/lib/companies.functions.ts                        (CRUD)
NEW src/lib/invoices.functions.ts                         (issue, revise, cancel, credit/debit)
NEW src/lib/payments.functions.ts
NEW src/lib/impersonation.functions.ts                    (start/end/verify)
NEW src/lib/state-payouts.functions.ts                    (accrue/approve/pay)
NEW src/lib/accruals.functions.ts                         (monthly engine)
NEW src/routes/api/public/cron.accruals.ts                (shared-secret endpoint)
NEW src/routes/app.companies.tsx
NEW src/routes/app.billing.invoices.tsx
NEW src/routes/app.billing.invoices.$invoiceId.tsx
NEW src/routes/app.payments.tsx
NEW src/routes/app.payouts.state.tsx                      (State Franchise payouts ledger)
NEW src/routes/app.audit.tsx
NEW src/routes/app.users.tsx                              (Users & Roles + entity access)
NEW src/routes/imp.$token.tsx                             (impersonation entry)
NEW src/components/app/ImpersonationBanner.tsx
NEW src/components/app/InvoicePrint.tsx                   (B2B/B2C/proforma/CN/DN)
EDIT src/components/app/AppSidebar.tsx                    (regrouped + role filters)
EDIT src/routes/app.state-franchises.$stateFranchiseId.tsx (Open Dashboard btn → impersonate)
EDIT src/routes/app.franchisees.$franchiseeId.tsx          (same)
EDIT src/lib/auth-context.tsx                              (impersonation context + new roles)
EDIT src/routes/__root.tsx                                 (mount ImpersonationBanner)
```

### 2.8 Demo data seeding

After approval, seed (all `is_demo=true`):
- 4 companies (HDK, MOS, Nail Emporium, X Nail Bar) — companies table real
- 3 demo state franchises (Maharashtra/Karnataka/Delhi) + credentials
- 6 demo city franchises across those states
- 4 demo salon branches under Nail Emporium
- 30 demo invoices across the chain (HDK→MOS→NE→downstream)
- 12 months of accrual ledger entries
- Demo login table (super_admin / accounts / state_demo@ / city_demo@ / academy_demo@ / store_demo@ / branch_demo@) with temp passwords surfaced in admin **Credentials** screen

---

## 3) Phase 2 (next iteration, after Phase 1 ships)

- City Franchise incentive engine (10% NE / 3% Academy / 3% Dark Store) wired to invoice lines
- Academy portal dashboard (academy_user role, own enrollments/fees only)
- Dark Store portal dashboard
- Salon Branch portal dashboard with service catalog + staff performance
- Customer master + customer-billing detail page
- Convert-lead-to-franchise flow + Kanban

## 4) Phase 3

- Reports Center with all 18 reports, filters, drill-down, CSV/PDF export
- Audit log expansion: impersonation event filters, before/after diffs
- GST summary placeholders for sales & purchases
- Approval matrix configurator
- Documents vault (upload to storage bucket + signed URLs)
- Notification engine for due payouts / overdue invoices

---

## 5) Business rule assumptions (please confirm before Phase 1 starts)

1. **ROI is computed monthly on full invested amount, not on outstanding balance.** Both state and city.
2. **State activation incentive** (₹1,50,000) is credited the month the city franchise is created with `status='active'`. If a city is later marked inactive, the incentive **stays** (no clawback). OK?
3. **10% state turnover share** is computed on `net invoiced amount minus credit notes` for invoices whose `bill_to_entity` is inside the state — **excluding** inter-company invoices upstream (HDK→MOS, MOS→NE). OK?
4. **7% student product margin**: applied to invoice lines tagged `category='student_product'` for academies inside the state. Need a flag on `product_categories` — added in migration.
5. **Impersonation default = read-only**, with super-admin toggle in Settings to enable read-write per session.
6. **Demo flag** is admin-visible only; non-admin users never see `is_demo=true` rows (enforced via RLS).
7. **Invoice numbering** resets per financial year (Apr 1 – Mar 31, India).
8. **Cancelled invoices** keep their number reserved (no renumbering).

If any of these need to change, tell me before I start the migration.

---

## What I need from you to start Phase 1 build

- ✅ Approve this plan (or edit assumptions in §5)
- Pick **cron trigger**: I'll add `pg_cron` to call `/api/public/cron/accruals` nightly (no external service needed). Confirm or say "manual run button only for now".
- Confirm SESSION_SECRET for impersonation JWT signing can be auto-generated and stored as a new secret (`IMPERSONATION_SECRET`).

On approval I'll ship Phase 1 in this order: migration → impersonation infra → companies + billing chain UI → state ROI engine + payouts ledger → sidebar regroup + demo seed.
