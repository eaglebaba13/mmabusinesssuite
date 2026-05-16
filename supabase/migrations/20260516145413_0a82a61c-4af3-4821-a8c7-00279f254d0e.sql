
CREATE OR REPLACE FUNCTION public.recalc_invoice_payment_state(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  grand numeric;
  paid_sum numeric;
  cn_sum numeric;
  dn_sum numeric;
  net_due numeric;
  ps public.pos_payment_status;
BEGIN
  IF _invoice_id IS NULL THEN RETURN; END IF;

  SELECT grand_total INTO grand FROM public.invoices WHERE id = _invoice_id;
  IF grand IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO paid_sum
    FROM public.payments
    WHERE invoice_id = _invoice_id
      AND direction = 'in'
      AND status <> 'cancelled';

  SELECT COALESCE(SUM(grand_total), 0) INTO cn_sum
    FROM public.invoices
    WHERE parent_invoice_id = _invoice_id
      AND doc_type = 'credit_note'
      AND status IN ('issued','paid');

  SELECT COALESCE(SUM(grand_total), 0) INTO dn_sum
    FROM public.invoices
    WHERE parent_invoice_id = _invoice_id
      AND doc_type = 'debit_note'
      AND status IN ('issued','paid');

  net_due := GREATEST(grand + dn_sum - cn_sum, 0);

  IF paid_sum <= 0 THEN ps := 'unpaid';
  ELSIF paid_sum < net_due THEN ps := 'partial';
  ELSE ps := 'paid';
  END IF;

  UPDATE public.invoices
    SET amount_paid = paid_sum,
        payment_status = ps,
        updated_at = now()
    WHERE id = _invoice_id;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.invoices WHERE doc_type NOT IN ('credit_note','debit_note') LOOP
    PERFORM public.recalc_invoice_payment_state(r.id);
  END LOOP;
END $$;
