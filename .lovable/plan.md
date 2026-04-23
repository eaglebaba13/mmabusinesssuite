

# Fix navigation + finish wiring Import buttons + Google Meet integration

Three scopes in one pass.

---

## Part 1 — "Open dashboard" still failing on franchisee cards

### Root cause
`FranchiseeActions.tsx` already uses `setTimeout(() => navigate(...), 0)`, but the menu lives **inside** the wrapping `<Link>`. When the dropdown closes, the trailing `mouseup` lands on the underlying `<Link>`, which fires its own navigation **before** Radix unmounts. Result: URL flips to `/app/franchisees/{id}` momentarily, then the wrapping link/route re-enters and the user lands back on the list (or never leaves it because the click target is intercepted by the menu portal).

### Fix
Restructure `app.franchisees.tsx` so the action menu is **not** a sibling of the `<Link>` inside a relative wrapper — instead, render the card body and the menu as siblings inside a non-link container, and make the body navigate via `useNavigate` only when the click target is the body itself:

- Replace the current `<div relative><Link>…</Link><div absolute><FranchiseeActions/></div></div>` with `<div role="link" onClick={…}>…<FranchiseeActions/></div>`.
- Inside the click handler check `e.target.closest("[data-actions]")` — if true, do nothing (action click), otherwise `navigate({ to: "/app/franchisees/$franchiseeId", params: { franchiseeId: f.id } })`.
- Wrap `FranchiseeActions` in `<div data-actions>` so the check works.
- Also drop the `setTimeout` wrappers in `FranchiseeActions.tsx` — with the menu no longer competing with a parent `<Link>`, plain `e.stopPropagation()` is enough and "Open dashboard" navigates cleanly. Edit/Reset/Deactivate/Delete also continue to work.

This is the simplest fix that breaks the click-through race for good. No more nested Link + portal collision.

---

## Part 2 — Import button on every remaining list page

The shared `ImportButton`, `ImportDialog`, parser and 17 entity configs are already built. Only **wiring** is needed. Configs that already exist are reused; missing ones get added.

### Pages that get `<ImportButton configKey="…" />` added next to existing "Add" / page header:

**Academy** (5 pages)
- `app.academy.students.tsx` → `students`
- `app.academy.courses.tsx` → `courses`
- `app.academy.batches.tsx` → `batches`
- `app.academy.fees.tsx` → `fee_payments`
- `app.academy.trainers.tsx` → **new config `trainers`** (full_name*, email, phone, specialization, bio)
- `app.academy.certificates.tsx` → **new config `certificates`** (enrollment_id*, certificate_code, grade, issued_on, remarks)

**Inventory** (5 pages)
- `app.inventory.products.tsx` → `products`
- `app.inventory.categories.tsx` → `product_categories`
- `app.inventory.warehouses.tsx` → `warehouses`
- `app.inventory.suppliers.tsx` → `suppliers`
- `app.inventory.purchase-orders.tsx` → `purchase_orders`

**Finance** (5 pages)
- `app.finance.revenue.tsx` → `revenue_entries`
- `app.finance.expenses.tsx` → `expenses`
- `app.finance.categories.tsx` → `expense_categories`
- `app.finance.payouts.tsx` → **new config `roi_payouts`** (franchisee_email*, payout_month*, base_roi, academy_incentive, dark_store_incentive, emporium_incentive, status)
- `app.finance.revenue-model.tsx` → **new config `franchisee_targets`** (franchisee_email, city, model_item_id*, target_numbers*)

**Webinars** (1 page)
- `app.webinars.index.tsx` → `webinars`

**HR / Settings** (already planned but missing wire)
- `app.hr.employees.tsx` → `employees`
- `app.settings.lead-routing.tsx` → `lead_routing_rules`

**Leads / Franchisees** (already wired) — left as-is.

### POS
Per your answer ("POS masters only"), no Import button on POS Orders/Bills. Products + Suppliers + Warehouses imports already cover the POS masters.

### Permissions on each Import button
Same role gate as the page's "Add" button (e.g. inventory pages → `isAdmin || hasRole("inventory")`, academy → `academy_admin`, finance → `accounts`, settings → `super_admin`). Franchisee role never sees Import buttons.

---

## Part 3 — Google Meet integration on Webinars (Connect + manual)

Per your answer: connect Google account once, then **manually paste / pick the Meet link** when creating a webinar. No auto-Meet creation right now.

### What gets built

**A. Google connector hookup** (one-time, per workspace)
- In Settings → Social, add a **"Connect Google Account"** button that calls `standard_connectors--connect` for the `google_calendar` connector. Stores OAuth tokens in the connector gateway. Status pill ("Connected as you@gmail.com" / "Not connected").

**B. Webinar create dialog upgrade (`app.webinars.index.tsx`)**
When `platform === "google_meet"`, show a small inline panel:
- **"Connect Google to enable Meet helpers"** — visible only if not connected, with the same Connect button.
- When connected:
  - **"Generate quick Meet link"** button that opens `https://meet.google.com/new` in a new tab — user creates the meeting in Google's UI, copies the URL, pastes back into the **Join URL** field.
  - **"Pick from upcoming Calendar events"** button (server fn `listUpcomingMeetEvents`) → fetches the next 20 events from your primary Google Calendar via the connector gateway (`/google_calendar/calendars/primary/events`), filters those with a `hangoutLink`/`conferenceData.entryPoints[].uri`, shows a small list. Click an event → auto-fills `Join URL`, `title`, `host_name`, `scheduled_at`, `duration_minutes`.
- Helper text: "Tip — paste any Meet, Zoom, or Teams URL into Join URL. Reminders automatically include this link."

**C. Reuse of existing pieces**
- `webinars.join_url`, `webhook_url`, `reminder_24h/1h` already exist and the public reminder endpoint already POSTs `join_url` to the webhook. Nothing else changes server-side; the new server fn is read-only.

**D. Files**
- `src/server/google-meet.functions.ts` — `listUpcomingMeetEvents` server fn calling the gateway with `LOVABLE_API_KEY` + `GOOGLE_CALENDAR_API_KEY` headers. Falls back gracefully if env vars are missing.
- `src/components/app/GoogleMeetPicker.tsx` — small picker UI inside the create dialog.
- Edit `src/routes/app.webinars.index.tsx` — mount the picker when platform = google_meet.
- Edit `src/routes/app.settings.social.tsx` — add the Connect Google card.

After approval I'll: (1) restructure the franchisee card so "Open dashboard" works, (2) drop `<ImportButton />` into all the listed pages and add the 4 missing configs (`trainers`, `certificates`, `roi_payouts`, `franchisee_targets`), (3) connect Google Calendar via `standard_connectors--connect`, ship the Meet picker + server fn, and add the connect card in Settings → Social.

