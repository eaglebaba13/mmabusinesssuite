Remove the From/To date range filter from the Franchisees page while keeping CSV/PDF export and demo-data exclusion intact.

## Why
The user wants to see all real franchisees without being constrained by a date range. Demo data should still be hidden in Live mode.

## Changes

**`src/routes/app.franchisees.tsx`**

1. **Hide date inputs** — pass `showDateRange={false}` to `<ExportBar>` and remove the `from`, `to`, `onFromChange`, `onToChange` props.
2. **Stop filtering by date** — remove the `inDateRange(...)` condition from the `filtered` array so search results are no longer narrowed by `joined_at`/`created_at`.
3. **Simplify export filenames** — since the date range is gone, drop the `range.from`/`range.to` suffix from the CSV/PDF filename and subtitle. Use a static name like `franchisees_roster`.
4. **Clean up unused imports and state** — remove `defaultDateRange` and `inDateRange` imports, and remove the `range` state variable since it will no longer be needed.

No backend or database changes required.