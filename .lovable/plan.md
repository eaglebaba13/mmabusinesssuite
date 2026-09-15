# Complete Franchise CSV Export

## Goal
Expand the Franchise section CSV so each filtered franchise row includes identity, contact, territory, assigned product, investment, total completed sales, total ROI, ROI paid, and ROI due.

## Implementation
- Load completed sales totals and all ROI payout totals grouped by franchise.
- Map assigned product IDs to product names.
- Add the requested fields to the CSV columns while preserving the current filters.
- Keep the PDF roster unchanged because the request is specifically for CSV.
- Verify the download values and current app health.

## Calculation rules
- **Total Sale:** sum of completed sales orders for the franchise.
- **Total ROI:** sum of each payout's payable amount.
- **Total ROI Paid:** payable amount for payouts marked paid.
- **Total ROI Dues:** payable amount for payouts not marked paid.
