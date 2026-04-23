

# Combined: Dropdown Fix + Bulk Import + Delete Demo Data

Three scopes in one implementation pass.

---

## Part 1 — Fix "Open dashboard" navigation

**Bug:** `src/components/app/FranchiseeActions.tsx` calls `e.preventDefault()` on every `DropdownMenuItem` click. Radix interprets that as "do not close the menu", so the menu stays mounted in its portal layer above the page, masking the new route. URL changes but UI doesn't.

**Fix in `FranchiseeActions.tsx`:**
- Replace `stop(e)` inside menu-item handlers with `e.stopPropagation()` only (drop `preventDefault`) so Radix closes the menu naturally.
- Wrap `navigate(...)`, `setEditOpen(true)`, `setDeleteOpen(true)`, and `toggleStatus.mutate()` in `setTimeout(fn, 0)` so they run after the close animation unmounts the portal.
- Keep the outer wrapper `<div onClick={stop} onMouseDown={stop}>` and the trigger button's `onClick={stop}` unchanged — those need both `preventDefault + stopPropagation` because they sit inside the card's `<Link>`.

No other files touched for this part.

---

## Part 2 — Delete demo data (one-time migration)

A single SQL migration. **Preserves**: `auth.users`, `profiles`, `user_roles`, `org_settings`, `revenue_model_items`, `expense_categories`, `product_categories`, and any `franchisees` row where `user_id IS NOT NULL` (real onboarded partners — Sidhhartha, test2).

**Wiped** (in dependency-safe order using `TRUNCATE ... RESTART IDENTITY CASCADE` where allowed, or scoped `DELETE` for tables with FK to preserved rows):

leads · lead_activities · lead_routing_rules · social_lead_events · webinar_registrations · webinars · ad_campaigns · revenue_entries · expenses · roi_payouts · franchisee_targets · sales_orders · sales_order_items · sale_payments · stock_movements · stock_levels · purchase_orders · purchase_order_items · products · suppliers · warehouses · students · enrollments · attendance · fee_payments · certificates · batches · courses · trainers · employees · employee_attendance · leave_requests · payroll_runs · payroll_items · departments · audit_logs · notifications · demo `franchisees` (where `user_id IS NULL`) + matching `franchisee_credentials`.

After this runs, every list page shows its empty state.

---

## Part 3 — Universal Import button

### Shared infrastructure (build once)

**`src/lib/import.ts`** — pure client parser
- Accepts `.csv` and `.xlsx` (uses `xlsx` package; if missing, added as dep)
- Returns `{ validRows, invalidRows, headers }` after Zod validation
- Trims strings, coerces numbers/dates, skips empty rows
- Maps friendly headers → DB columns per config

**`src/components/app/ImportDialog.tsx`** — 3-step wizard
1. **Download template** → generates CSV with required headers (asterisk = required) + 1 example row
2. **Upload file** → drop zone or picker, parses live, shows preview (first 10 rows + totals) with green/red row badges
3. **Review & import** → "Import N valid rows" runs `supabase.from(table).insert(...)` in 500-row batches, progress toast, downloadable `import-errors-{date}.csv` for failed rows

**`src/components/app/ImportButton.tsx`** — `<Upload /> Import` button taking an `ImportConfig` prop

**`src/lib/import-configs.ts`** — all per-entity configs in one file, each with `{ entity, table, templateColumns, schema, transform, queryKey }`

### Foreign-key resolution

Configs use friendly lookups so users don't need UUIDs:
- `category` → `product_categories.slug`
- `supplier_code` → `suppliers.code`
- `warehouse_code` → `warehouses.code`
- `franchisee_email` → `franchisees.email`
- `course_code` → `courses.code`
- `trainer_email` → `trainers.email`
- `department_code` → `departments.code`
- `assign_to_user_email` → `profiles.email`

The `transform` step batch-fetches lookups before insert; rows with unresolved FKs land in invalid bucket with a clear "Unknown supplier_code: XYZ" message.

### Pages getting the button

`/app/leads` · `/app/franchisees` · `/app/inventory/products` · `/app/inventory/categories` · `/app/inventory/suppliers` · `/app/inventory/warehouses` · `/app/inventory/purchase-orders` · `/app/finance/revenue` · `/app/finance/expenses` · `/app/finance/categories` · `/app/academy/students` · `/app/academy/courses` · `/app/academy/batches` · `/app/academy/fees` · `/app/webinars` · `/app/hr/employees` · `/app/settings/lead-routing`

Button sits next to each page's existing "Add" button and inherits the same role guard (so franchisee role never sees it).

### Audit + safety
- One `audit_logs` row per import (`action: 'bulk_import'`, `entity`, `metadata: { count, filename }`)
- Imports run as the logged-in user — RLS still applies, no privilege escalation
- All invalid rows downloadable so users fix and re-upload only the failures

---

## Files

**Migration** (1)
- Truncate demo data, preserve real users + onboarded franchisees + config tables

**Edit** (1, for Part 1)
- `src/components/app/FranchiseeActions.tsx`

**Create** (4, for Part 3)
- `src/lib/import.ts`
- `src/lib/import-configs.ts`
- `src/components/app/ImportDialog.tsx`
- `src/components/app/ImportButton.tsx`

**Edit** (17, for Part 3 — add `<ImportButton config={...} />` next to existing "Add")
- `src/routes/app.leads.tsx`
- `src/routes/app.franchisees.tsx`
- `src/routes/app.inventory.products.tsx`
- `src/routes/app.inventory.categories.tsx`
- `src/routes/app.inventory.suppliers.tsx`
- `src/routes/app.inventory.warehouses.tsx`
- `src/routes/app.inventory.purchase-orders.tsx`
- `src/routes/app.finance.revenue.tsx`
- `src/routes/app.finance.expenses.tsx`
- `src/routes/app.finance.categories.tsx`
- `src/routes/app.academy.students.tsx`
- `src/routes/app.academy.courses.tsx`
- `src/routes/app.academy.batches.tsx`
- `src/routes/app.academy.fees.tsx`
- `src/routes/app.webinars.index.tsx`
- `src/routes/app.hr.employees.tsx`
- `src/routes/app.settings.lead-routing.tsx`

## Order of execution
1. Apply navigation fix to `FranchiseeActions.tsx` (immediate user unblock).
2. Run the demo-data truncate migration.
3. Build shared importer (parser + dialog + button + configs).
4. Wire `<ImportButton />` into all 17 list pages in one pass.

