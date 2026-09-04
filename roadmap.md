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

## MMA Official Document Generation System (Finance → Documents)
- [x] Master letterhead + company seal assets (from MMA_Letter_Head.docx / seal upload)
- [x] `official_documents`, `official_document_versions`, `document_number_counters` + `next_document_number`
- [x] Private `official-documents` bucket + storage RLS
- [x] Doc model, PDF + DOCX renderers on the master letterhead
- [x] 12 builders wired to live suite data (ROI claim, agreement, invoice, receipt, payout, PO, offer letter, franchise letters, official letter)
- [x] Generation/versioning service with secure signed-URL downloads
- [x] Document Generator page + preview dialog + sidebar entry
- [ ] End-to-end verification of all document types
- [x] Security: `invoice-sources` bucket made private, signed-URL access only
