# पूरा system connect करना — Sales, Finance, POS, Franchisee, Revenue Model, Meta Ads

मुख्य problem यह है कि अलग-अलग module के बीच data **link नहीं हो रहा**:
- POS bills किसी franchisee से जुड़े नहीं हैं (`franchisee_id = NULL`)
- Warehouses किसी franchisee से mapped नहीं
- Finance में POS sales दिखती ही नहीं
- Revenue Model edit नहीं हो सकता
- "Open dashboard" actually franchisee की view नहीं खोलता
- POS invoice download/send नहीं हो रहा
- Nail Emporium role exist ही नहीं करता
- Meta-format CSV upload पर error आती है

नीचे 7 हिस्सों में पूरा solution है।

---

## 1. Franchisee ↔ Warehouse linkage (foundation)

बिना इसके POS sales franchisee से auto-link नहीं हो सकतीं।

**DB migration**:
- `warehouses.franchisee_id` और `franchisees.warehouse_id` के बीच एक sync trigger — एक तरफ update हो तो दूसरी तरफ खुद-ब-खुद reflect.
- Existing 4 franchisees में से जिनके पास warehouse नहीं है उनके लिए कुछ नहीं — admin manually link करेगा।

**UI**:
- `app.inventory.warehouses.tsx` के Add/Edit dialog में नया **"Assigned franchisee"** dropdown (active franchisees की list).
- `app.franchisees.$franchiseeId.tsx` के Profile tab में **"Linked warehouse"** card — warehouse pick या नया create।

---

## 2. POS bills → franchisee auto-link + GST invoice flow

**`app.pos.index.tsx`**:
- Warehouse select करते ही उसके सामने **"Selling for: [Franchisee name]"** badge दिखे (warehouse से derive)।
- Cart top पर एक optional **"Selling for"** override dropdown (admin/Nail Emporium use करेगा).
- Checkout पर `sales_orders.franchisee_id` भी insert हो — warehouse से या override से derive करके।
- Customer email/address fields भी अब cart में add (अभी सिर्फ name/phone/GSTIN है — full GST invoice के लिए चाहिए).

**`app.pos.orders.$orderId.tsx`** (invoice screen) — *Download/Print already है, लेकिन **"Send to customer"** missing*:
- एक dropdown button **"Send invoice"** add — options:
  - **WhatsApp** — invoice PDF का public link + pre-filled message → `https://wa.me/<phone>?text=...` open नया tab में।
  - **Email** — server function `sendInvoiceEmail` जो PDF generate करके customer email पर भेजे (Lovable AI Gateway via Resend integration). Email subject: "Invoice INV-2026-XXXXX from [Warehouse]"; body: GST-compliant text + PDF attachment।
  - **Copy link** — invoice का public view URL clipboard में।
- For public invoice viewing, एक नया route `routes/invoice.$publicId.tsx` — read-only, signed-link access (token-based, no auth), buyer apne phone पर खोल सके।

**Existing GST PDF (`invoice-pdf.ts`)** — already complete है। Sirf send button जोड़ना है।

---

## 3. Finance ↔ POS connectivity

**`app.finance.index.tsx`** (Overview):
- Existing 6-month chart में अभी सिर्फ `revenue_entries + fee_payments` हैं। POS sales add करनी हैं:
  - नया query: completed `sales_orders` (`status='completed'`) last 6 months → monthly buckets में `grand_total` जोड़ें।
  - Recent Revenue list में manual entries के साथ-साथ last 5 POS invoices भी merge हों, हर item पर "POS / Manual / Fees" badge।

**`app.finance.revenue.tsx`** (Revenue Ledger):
- अभी सिर्फ `revenue_entries` दिखता है। नए layout में 3 tabs:
  - **All revenue** (default — manual + POS + fees merged, sorted by date)
  - **Manual entries** (existing behavior)
  - **POS sales** (sales_orders से completed bills, invoice no, customer, franchisee → linked warehouse)
- Franchisee filter dropdown — per-partner revenue।
- CSV/PDF export सब 3 sources merge करके।

---

## 4. Revenue Model editable + Webinar items

**`app.finance.revenue-model.tsx`** abhi sirf **targets** save karta hai, **lines edit nahi hote**.

**नया**:
- हर row inline-editable: `particulars`, `mrp`, `offer_value`, `offer_cost`, `franchisee_roi_pct`, `state_partner_pct`, `category` — admin/accounts edit करें।
- Top-right **"Add line item"** button — naya item bhi add ho sake (category dropdown + inputs).
- **Delete row** action (soft delete via `active=false`).
- Webinar items — आपकी पसंद के अनुसार existing **MMA Program** category mein add होंगे:
  - Seed data migration: 2 नए items "Big Coach Webinar" और "Nail Coach Webinar" इसी category में add।
- POS पर ye revenue-model items POS catalog में नहीं आते — वो `products` table अलग है। Lekin ek छोटा cross-link दिखाएँ: revenue-model row पर click → "Sales recorded against this category in last 30 days" मिनी-stat (sales_orders से derive)।

---

## 5. Franchisee dashboard data fetch fix

POS-franchisee link होने के बाद `FranchiseeDashboard.tsx` का existing query `sales_orders.franchisee_id=eq.X` automatically काम करेगा। Lekin ek aur fix:

- Existing franchisees (POONAM, MITHUN, NIKHIL, RAJESH) के पास abhi `warehouse_id = NULL` है, इसलिए **inventory snapshot blank** दिख रहा है।
- एक one-time data migration: sole warehouse "vadodara" को RAJESH TRADING (VD201) से link करें (city match)। बाकी 3 admin manually link करेंगे new UI से।
- Negative stock cleanup: `stock_levels.quantity < 0` को 0 par reset (audit log entry के साथ)।
- "Set Opening Stock" quick action `app.inventory.stock.tsx` में — बिना bill के पहले stock भरने का तरीका।

---

## 6. "Open Dashboard" naya tab + impersonation

Aapne kaha **naya tab, read-only view** — perfect.

**Implementation**:
- `FranchiseeActions.tsx` mein "Open dashboard" item ka behavior — `window.open(url, "_blank")` use kare, jahaan URL ho `/app/franchisees/<id>?as_franchisee=1`।
- `app.franchisees.$franchiseeId.tsx` me jab `as_franchisee=1` search param ho:
  - Top par ek sticky banner: **"Viewing as POONAM SONI · You are viewing this dashboard read-only · Back to Master"** — back button master franchisees list पर वापस।
  - Default tab `dashboard` खुले (currently `dashboard` ही default hai — good).
  - Sidebar hide ho jaye is mode mein, full-width view (focus mode), aur edit/delete actions disable.
- Master logout/session par koi asar nahi — actual login switch nahi hota, sirf admin apne hi credentials se ek franchisee ka pure dashboard dekh rahe hain.

---

## 7. Nail Emporium role + access

**DB migration**:
- `app_role` enum mein naya value `nail_emporium` add।
- Default RLS policies update — `nail_emporium` ko ye sab read/write access:
  - `products`, `product_categories`, `stock_levels`, `stock_movements`, `warehouses`, `purchase_orders` → full
  - `sales_orders`, `sale_payments`, `sales_order_items` → full (POS billing + dispatch)
  - `revenue_entries`, `expenses`, `roi_payouts` → read-only
  - `franchisees` → read-only (master + each franchisee dashboard view)
  - `leads`, `lead_activities` → read-only

**UI**:
- `AppSidebar.tsx` mein:
  - `isNailEmporium = hasRole("nail_emporium")` flag।
  - Show: Dashboard, Leads (read), Franchisees (read), Inventory (full), POS (full), Finance (read).
- `app.settings.team.tsx` (already has role grant UI) — `nail_emporium` enum entry automatically dropdown mein dikhega.
- POS pages mein `useBlockFranchiseeRoute` jaisa hi behavior — Nail Emporium user POS use kar sake, lekin franchisee profile edit/delete jaise admin actions nahi.

**Dispatching tracking**:
- `sales_orders` mein 2 naye optional columns: `dispatched_at timestamptz`, `dispatch_tracking text`, `dispatched_by uuid`।
- Order detail page par naya **"Mark dispatched"** card — Nail Emporium ya admin mark kar sake, tracking number bhi save।

---

## 8. Leads — Meta Ads CSV import (now) + API hook (future-ready)

Aapne kaha **dono** — abhi CSV perfect, future API ke liye structure ready।

**Now** (immediate):
- `import-configs.ts` ke `leadsConfig.aliases` mein Meta-format headers add:
  - `full_name` ke aliases: `full name`, `lead_full_name`, `field_data_full_name`
  - `email` ke aliases: `email_address`, `field_data_email`
  - `phone` ke aliases: `phone_number`, `field_data_phone_number`
  - `ad_name` ke aliases: `ad_name`, `adset_name`, `campaign_name`
  - `source` ke aliases: `platform` (auto-map to `meta_ads`)
  - `notes` ke aliases: `additional_responses` (free text capture)
- **"Download Meta-format template"** button — `app.leads.tsx` mein Import Dialog ke andar second link, ek aur CSV jiska headers exactly match karein Meta Ads Manager export ke (case-insensitive normalisation already implemented hai).
- Test: aapki actual Meta CSV upload → 0 errors. Common Meta fields: `created_time`, `id` (lead id), `ad_id`, `ad_name`, `adset_id`, `adset_name`, `campaign_id`, `campaign_name`, `form_id`, `is_organic`, `platform`. Ye sab harmless extra columns ho jayenge (parser ignore karta hai unrecognised columns).

**Future-ready** (structure ready, integration later):
- `routes/api/public/social-lead-hook.ts` already exists — Meta App Webhook configure karne ka endpoint already production-ready hai. Plan mein code change nahi, sirf documentation ke through aapko Meta Business Suite mein webhook URL configure karne ka steps note dene hain (Settings → Integrations card mein "Meta webhook URL" aur secret display).

---

## Files touched (high-level)

**New migration**:
- `nail_emporium` enum value + RLS grants
- warehouse↔franchisee sync trigger + one-time vadodara→RAJESH link + negative stock cleanup
- 2 webinar revenue-model items seed
- `sales_orders.dispatched_at/tracking/dispatched_by` columns
- public invoice token table for shareable invoice URLs

**Edit**:
- `src/components/app/AppSidebar.tsx` — Nail Emporium nav
- `src/components/app/FranchiseeActions.tsx` — naya tab + as_franchisee param
- `src/components/app/FranchiseeDashboard.tsx` — read-only flag
- `src/routes/app.franchisees.$franchiseeId.tsx` — impersonation banner
- `src/routes/app.inventory.warehouses.tsx` — assign franchisee
- `src/routes/app.pos.index.tsx` — franchisee link + extra fields
- `src/routes/app.pos.orders.$orderId.tsx` — Send dropdown (WhatsApp/Email/Copy link) + Mark dispatched card
- `src/routes/app.pos.orders.tsx` — franchisee column
- `src/routes/app.finance.index.tsx` — POS sales merge in chart + recent
- `src/routes/app.finance.revenue.tsx` — 3-tab merged view + franchisee filter
- `src/routes/app.finance.revenue-model.tsx` — inline-editable rows + add/delete
- `src/lib/import-configs.ts` — Meta aliases
- `src/components/app/ImportDialog.tsx` — Meta template button
- `src/server/invoice-email.functions.ts` (new) — server fn for email send
- `src/routes/invoice.$token.tsx` (new) — public invoice view
- `src/routes/app.settings.index.tsx` — display Meta webhook URL/secret card

---

## Result — आपको kya milega

1. POONAM SONI ki ID se sale ho — apne dashboard mein **automatically** revenue, ROI, P&L sab live dikhega.
2. POS pe bill bante hi Finance Overview chart aur Revenue Ledger mein wo ₹46,964/₹14L wali sales reflect hongi.
3. Master dashboard se POONAM/MITHUN/NIKHIL/RAJESH ke "Open dashboard" par click — naya tab khulega, sirf un ka full read-only view, top par "Back to Master" bar.
4. Revenue Model directly edit hoga — particulars, MRP, %, naya line item add, delete sab.
5. Webinar (Big Coach, Nail Coach) MMA Program category mein dikhenge.
6. Invoice screen pe Send → WhatsApp / Email / Copy link → customer ko full GST invoice + PDF.
7. Nail Emporium login banaye ja sake — wo inventory + POS chala sake, finance/leads/franchisee dekh sake, dispatch mark kare.
8. Meta Ads ka leads CSV bina kisi error ke upload — column names auto-map ho jayenge.