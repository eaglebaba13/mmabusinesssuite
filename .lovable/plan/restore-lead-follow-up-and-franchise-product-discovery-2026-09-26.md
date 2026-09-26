# Restore lead follow-up and franchise product discovery

Both findings match the current code. A simple rollback would reopen the earlier security issues: unassigned leads contain personal contact details, and the products table contains cost prices. The correction therefore needs a controlled read-and-claim flow, not a broad permission change.

## What to build

1. **New leads for sales:** Add an unassigned-lead queue that shows sales staff only limited, non-contact preview information. Add a “Claim” action that assigns one lead atomically to the signed-in sales user; after claiming, the existing lead list and detail page show the full record. Keep assigned leads private to their owner and keep the current restricted lead SELECT rule.
2. **Full franchise product catalog:** Let franchise users browse active products even before stock exists at their outlet. Serve only safe catalog fields (name, SKU, selling price, unit, etc.) to their POS and product browsing screens. Preserve restricted access to the base products table and its cost price; keep stock and warehouse reads scoped to the franchise's own records. Inventory/ordering views that genuinely need cost should continue to use their existing authorised access, rather than granting every franchise user the full table.
3. Verify the lead claim with two competing users, ownership after claim, full catalog visibility for an unstocked product, and rejection of unauthorised access. Mark only these two monitoring findings fixed after the new flow is applied and verified.

## Technical approach

- Add a new database migration (do not edit the applied September migration). Use narrowly scoped, authenticated database functions or authenticated server functions that enforce sales/franchise membership server-side; allow atomic `UPDATE ... WHERE assigned_to IS NULL` for claiming. Return only permitted columns from the catalog service and minimal fields from the unassigned-lead queue.
- Update the lead list with a separate unassigned queue and claim action; keep existing assigned-lead queries unchanged. Wire franchise-facing POS and catalog screens to the safe product read, separating privileged inventory price editing from read-only franchise browsing.
- Apply the migration through the database migration approval tool, then test the signed-in flows and permissions before resolving the findings.