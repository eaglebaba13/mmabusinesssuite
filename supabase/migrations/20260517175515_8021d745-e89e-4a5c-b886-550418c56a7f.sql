
UPDATE public.companies
SET address = jsonb_build_object(
      'line1', '1st Floor, Above Deep Tyre, N.H.8, Bhuwana, Girwa',
      'city', 'Udaipur', 'pincode', '313001',
      'state', 'Rajasthan', 'state_code', '08'),
    gstin = COALESCE(gstin, '08AAEC02759F1ZC'),
    legal_name = COALESCE(legal_name, 'ONE STOP MALL OF SALON PVT. LTD.'),
    contact_email = COALESCE(contact_email, 'hello@mallofsalon.com'),
    contact_phone = COALESCE(contact_phone, '+91 890 588 9549'),
    invoice_prefix = COALESCE(invoice_prefix, 'MOS')
WHERE id = 'a9b9b295-13c2-4d67-b58d-6c1957a6c33f';

UPDATE public.territories
SET state_franchise_id = (SELECT id FROM public.state_franchises WHERE state='Gujarat' LIMIT 1)
WHERE name = 'Ahmedabad' AND state = 'Gujarat' AND state_franchise_id IS NULL;

UPDATE public.franchisees
SET territory_id = (SELECT id FROM public.territories WHERE name='Ahmedabad' AND state='Gujarat' LIMIT 1)
WHERE full_name = 'Solanki Manjulaben Maheshbhai' AND territory_id IS NULL;

-- Re-derive state_franchise_id on the seeded invoice
UPDATE public.invoices
SET franchisee_id = franchisee_id
WHERE source_document_ref = 'PI/1021';
