# Roadmap

## ROI Claim Letter workflow (Finance → ROI Payouts)
- [x] DB: franchisee code/auth name/address/bank fields, `roi_claims`, `roi_claim_versions`, claim ref sequence
- [x] Private `roi-claims` bucket (do NOT touch `invoice-sources`)
- [x] Storage RLS on `roi-claims` (finance staff manage; franchisee reads own folder)
- [x] Claim data mapping + PDF (jsPDF, letterhead) + DOCX (docx pkg) generators
- [x] Payout row action: Generate / View ROI Claim, preview dialog (PDF, DOCX, print, regenerate, status)
- [x] Auto-generate payouts also auto-generates claims (duplicate-safe per payout)
- [x] Franchisee detail page: ROI Claims history section
- [x] Franchisee edit: bank + code/auth name/address fields (so validation gaps can be fixed)
