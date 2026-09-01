# Fix: cash-paid POS bills show as unpaid on the franchise dashboard

## What's actually wrong (confirmed from data)

Every completed POS sale is fully paid (95 payments, ₹1.26 Cr recorded, each order's status = `paid`), but the mirrored franchise invoice for the same sale still says `unpaid` with paid = ₹0. Example: INV-2026-00095 — order paid ₹1,09,504, mirrored invoice amount paid ₹0.

Cause: when a sale is completed, the franchise invoice copy is created at that instant, before the cash payment rows are written. Afterwards, recording the payment only updates the POS order — nothing pushes the paid amount onto the mirrored invoice. So the franchise/entity dashboard, which reads invoices, shows ₹0 paid and full outstanding.

## Fix

1. Keep the mirrored invoice in sync with POS payments: whenever a POS payment is added, changed, or removed, update the linked franchise invoice's paid amount and payment status (unpaid / partial / paid) from the order's actual collected total.
2. Also set the paid amount correctly at mirror-creation time, so a sale completed with payment already recorded doesn't start at ₹0.
3. One-time correction of existing records: recompute paid amount and payment status for all mirrored invoices from their POS orders, so historical bills stop showing as outstanding.

After this, "Paid" and "Outstanding" on the entity/franchise dashboard will match the POS reality; ROI figures stay unchanged (they use invoice totals, not payment status).

## Technical notes

- New trigger function on `public.sale_payments` (INSERT/UPDATE/DELETE) that resolves the invoice via `invoices.source_document_ref = 'pos:' || order_id` and sets `amount_paid` / `payment_status` from `sales_orders.amount_paid` vs `grand_total`.
- `mirror_pos_order_to_invoice()` already copies `NEW.amount_paid`; keep it, the new trigger covers the ordering gap.
- Backfill `UPDATE invoices ... FROM sales_orders` for rows where `source_document_ref` starts with `pos:`.
- No UI changes.
