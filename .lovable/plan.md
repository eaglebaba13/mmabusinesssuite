

# Fix "full_name: Invalid input" import error

## Root cause

The downloadable template writes required headers as **`full_name*`** (with an asterisk), but the parser then looks up the value under the bare key **`full_name`**. So `raw.full_name` is `undefined` for every row, the Zod `union([string, number])` rejects undefined with the default message **"Invalid input"**, and every row in the screenshot fails — even though the names are clearly present in the column.

This affects **every required column in every import template** (leads, franchisees, products, suppliers, students, courses, etc.), not just leads. Anyone who downloads the template, fills it in, and re-uploads it as-is hits this exact error.

A second, smaller cause: even if a user manually drops the asterisk, a CSV exported from Excel can have headers like `Full Name`, `FULL_NAME`, or `full_name ` (trailing space) — none of those match either.

## Fix (one place, all entities benefit)

In `src/lib/import.ts`, **normalise headers when parsing the file** so that:

1. Trailing `*` (required marker) is stripped.
2. Whitespace around the header is trimmed (already done) **and** internal runs of whitespace are collapsed to single underscores.
3. Header is lower-cased.
4. Common aliases are mapped to canonical keys (e.g. `name` → `full_name` for leads/students, `mobile`/`mobile_number` → `phone`, `email_id` → `email`, `dob` → `date_of_birth`).

Concretely:

- Add a small `normaliseHeader(h: string)`: lowercase, trim, drop trailing `*`, replace non-alphanumeric runs with `_`, collapse repeats, strip leading/trailing `_`.
- Add an optional `aliases?: Record<string, string>` field to `ImportConfig` so each config can declare its own aliases (e.g. leads gets `{ name: "full_name", "lead name": "full_name", mobile: "phone" }`).
- In `parseFile`, build the row object using `aliases[normalised] ?? normalised` as the key.
- Apply this both when reading data rows **and** when interpreting headers.

This single change makes `full_name`, `Full Name`, `full_name*`, `FULL_NAME`, and `Name` all resolve to the same field — the user's existing CSV (the one in your screenshot) imports cleanly.

## Also: friendlier error messages

Update `requiredString(label)` in `src/lib/import-configs.ts` so the message reads **`"<label> is required"`** instead of Zod's default `"Invalid input"`. So a genuinely-empty `full_name` cell now shows `"full_name: full_name is required"` — clear that the cell is empty, not that the data type is wrong.

## Aliases shipped with this fix

- **Leads**: `name`, `lead_name`, `customer_name` → `full_name`; `mobile`, `mobile_number`, `whatsapp` → `phone`; `email_id`, `mail` → `email`; `ad`, `creative`, `ad_set`, `ad set name` → `ad_name`.
- **Franchisees**: `partner_name`, `business_name` → `full_name`; `mobile` → `phone`.
- **Students**: `name`, `student_name` → `full_name`; `dob` → `date_of_birth`; `mobile` → `phone`.
- **Products**: `product_name` → `name`; `category_name` → `category`.
- **Suppliers**: `supplier_name`, `vendor` → `name`.
- **Warehouses**: `warehouse_name` → `name`; `warehouse_code` → `code`.

(Each config gets its own short alias map. No effect on existing valid templates.)

## Files touched

1. `src/lib/import.ts` — add `normaliseHeader`, accept optional `aliases`, apply both in `parseFile`.
2. `src/lib/import-configs.ts` — change `requiredString` message; add `aliases` to leads, franchisees, students, products, suppliers, warehouses, courses, batches, fee_payments, trainers, certificates, employees configs.

No DB migration. No UI/route changes. Existing valid imports continue to work.

## Result

The exact CSV in the screenshot — with names like `ALKAA_Mahandi_art`, `Setu vyash`, `Boss`, `Ivy`, `falguni krunal prajapati` — will import cleanly. Only rows with **truly empty** `full_name` cells will be rejected, and they'll show a clear `"full_name is required"` message instead of `"Invalid input"`.

