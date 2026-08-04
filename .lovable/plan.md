# Fix: Franchise Portal shows "No franchise on record"

## What's actually wrong

The portal failure has nothing to do with the agreement, custom fee, product investment, or product/agreement IDs. The portal page (`/app/my-franchise`) never reads product or agreement data at all — it only looks up the franchisee row, then passes `investment_amount` (already ₹4,25,000 on the row) to the dashboard.

Verified in the database: the login user `0f44cceb-…975b` (email `ppbaldota37@gmail.com`) owns **two** franchisee records:

| Franchisee | Investment |
|---|---|
| Pushpak Pravin Baldota | ₹4,25,000 |
| SHRADHA PUSHPAK BALDOTA | ₹3,10,000 |

Both rows carry the same `user_id` and the same email. The portal query uses `.maybeSingle()`, which fails when more than one row matches. The code then discards the error and returns `null`, so the page renders the empty state. The email fallback hits the same two rows and fails identically.

Super Admin impersonation works because it fetches one franchisee by explicit ID — it never has to disambiguate.

So the answers to the raised questions: (1)(2)(7)(8) no — the portal does not read product investment or custom fee anywhere; (3) yes, the franchise lookup fails first; (4) no, only `user_id` is required; (9) not RLS — the `franchisees self select` policy correctly allows `auth.uid() = user_id`, and both rows are readable. The single cause is the single-row assumption.

## The fix

### 1. Multi-franchise-safe lookup
Replace the `.maybeSingle()` calls in `src/routes/app.my-franchise.tsx` with list queries that return all franchisees for the signed-in user:

- Primary: `select * from franchisees where user_id = auth user id order by created_at`
- Fallback (only if primary returns zero rows): case-insensitive email match
- Stop swallowing errors — throw the Supabase error so React Query surfaces a real failure instead of a misleading empty state.

### 2. Franchise switcher when a user owns more than one
When the query returns multiple franchisees, render a compact selector (a select control in the page header, above the existing tabs) and keep the chosen franchisee's ID in component state, defaulting to the first row. All existing tabs — Dashboard, Leads, Campaigns, Timeline, Documents, Agreements — receive the selected franchisee. When there is exactly one row, no selector appears and the page looks unchanged.

No layout or visual redesign; the switcher is the only added element and only for multi-franchise users.

### 3. Empty state only when truly empty
"No franchise on record" renders only when the query succeeds with zero rows. A query error renders a retryable error message instead.

### 4. Investment source, made explicit
The dashboard keeps using the franchisee row's `investment_amount`, which is the negotiated/custom value (₹4,25,000 here) and already independent of the master product template. No fallback to product investment is introduced, because the franchisee row is the authoritative agreement-level figure — the same source the Entity Dashboard reads. This makes the portal and impersonation views numerically identical.

## Technical notes

- File changed: `src/routes/app.my-franchise.tsx` (query + selector wiring only).
- No migration and no RLS change required; existing policies already permit these reads.
- Diagnostic logging of the resolution steps (auth user id, matched franchisee IDs, chosen ID, investment used) is added behind `import.meta.env.DEV` so it does not run on published builds.
- Same latent `.maybeSingle()` pattern will be checked in the state-franchise portal (`/app/my-state`) and fixed the same way if a user can own multiple state franchises.
