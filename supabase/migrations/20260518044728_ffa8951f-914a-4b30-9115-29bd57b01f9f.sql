-- Backfill mapping fields down revision chains by walking parent_invoice_id to the root.
WITH RECURSIVE chain AS (
  SELECT id, parent_invoice_id, franchisee_id, state_franchise_id, is_intercompany,
         source_document_ref, source_document_url, id AS root_id, 0 AS depth
  FROM public.invoices
  UNION ALL
  SELECT c.id, p.parent_invoice_id, p.franchisee_id, p.state_franchise_id, p.is_intercompany,
         p.source_document_ref, p.source_document_url, p.id, c.depth + 1
  FROM chain c
  JOIN public.invoices p ON p.id = c.parent_invoice_id
  WHERE c.depth < 20
),
roots AS (
  SELECT DISTINCT ON (id) id, franchisee_id, state_franchise_id, is_intercompany,
         source_document_ref, source_document_url
  FROM chain
  ORDER BY id, depth DESC
)
UPDATE public.invoices i
SET franchisee_id      = COALESCE(i.franchisee_id, r.franchisee_id),
    state_franchise_id = COALESCE(i.state_franchise_id, r.state_franchise_id),
    is_intercompany    = COALESCE(i.is_intercompany, r.is_intercompany),
    source_document_ref = COALESCE(i.source_document_ref, r.source_document_ref),
    source_document_url = COALESCE(i.source_document_url, r.source_document_url)
FROM roots r
WHERE r.id = i.id
  AND (
    (i.franchisee_id IS NULL AND r.franchisee_id IS NOT NULL)
    OR (i.state_franchise_id IS NULL AND r.state_franchise_id IS NOT NULL)
    OR (i.source_document_ref IS NULL AND r.source_document_ref IS NOT NULL)
    OR (i.source_document_url IS NULL AND r.source_document_url IS NOT NULL)
  );