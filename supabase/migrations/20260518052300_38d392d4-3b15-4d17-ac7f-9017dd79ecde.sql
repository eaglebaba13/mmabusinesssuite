
-- 1. Schema: soft-delete columns for invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_archived_at ON public.invoices(archived_at);

-- 2. Snapshot pre-cleanup counts into audit metadata
DO $$
DECLARE
  v_proformas INT;
  v_non_proforma INT;
  v_payments INT;
  v_items INT;
BEGIN
  SELECT COUNT(*) INTO v_proformas FROM public.invoices WHERE doc_type = 'proforma';
  SELECT COUNT(*) INTO v_non_proforma FROM public.invoices WHERE doc_type <> 'proforma';
  SELECT COUNT(*) INTO v_payments FROM public.payments;
  SELECT COUNT(*) INTO v_items FROM public.invoice_items
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE doc_type <> 'proforma');

  -- 3. Archive all historical proformas (soft delete; preserved for audit)
  UPDATE public.invoices
    SET archived_at = now(),
        archived_reason = 'Proforma deprecated from active billing flow (cleanup 2026-05-18)',
        updated_at = now()
    WHERE doc_type = 'proforma' AND archived_at IS NULL;

  -- 4. Hard-delete all non-proforma test transactional data
  DELETE FROM public.payments
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE doc_type <> 'proforma');
  DELETE FROM public.invoice_items
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE doc_type <> 'proforma');
  -- Detach revision links pointing at to-be-deleted invoices (preserve proforma chain refs if any)
  UPDATE public.invoices SET parent_invoice_id = NULL
    WHERE parent_invoice_id IN (SELECT id FROM public.invoices WHERE doc_type <> 'proforma');
  DELETE FROM public.invoices WHERE doc_type <> 'proforma';

  -- 5. Reset invoice numbering rules so new invoices start at 1
  UPDATE public.invoice_numbering_rules SET current_seq = 0;

  -- 6. Audit log entry (system action, no user_id)
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, metadata)
  VALUES (
    NULL,
    'billing.cleanup.reset',
    'system',
    gen_random_uuid(),
    jsonb_build_object(
      'proformas_archived', v_proformas,
      'invoices_deleted', v_non_proforma,
      'invoice_items_deleted', v_items,
      'payments_deleted', v_payments,
      'numbering_rules_reset', true,
      'note', 'Proforma removed from active flow; test transactional data cleared; masters preserved.'
    )
  );
END $$;
