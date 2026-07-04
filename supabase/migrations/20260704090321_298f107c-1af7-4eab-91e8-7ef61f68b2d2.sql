
CREATE INDEX IF NOT EXISTS invoices_source_document_ref_idx
  ON public.invoices (source_document_ref)
  WHERE source_document_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mirror_pos_order_to_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_doc_type public.invoice_doc_type;
  resolved_company uuid;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF NEW.franchisee_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE source_document_ref = ('pos:' || NEW.id::text)
  ) THEN
    RETURN NEW;
  END IF;

  resolved_company := NEW.company_id;
  IF resolved_company IS NULL THEN
    SELECT id INTO resolved_company FROM public.companies ORDER BY created_at LIMIT 1;
  END IF;
  IF resolved_company IS NULL THEN RETURN NEW; END IF;

  new_doc_type := CASE WHEN COALESCE(NEW.customer_gstin,'') <> ''
                       THEN 'b2b_tax'::public.invoice_doc_type
                       ELSE 'b2c'::public.invoice_doc_type END;

  INSERT INTO public.invoices (
    company_id, franchisee_id,
    doc_type, invoice_number, invoice_date,
    subtotal, discount_total, gst_total, cgst_total, sgst_total, igst_total, grand_total,
    amount_paid, payment_status, status,
    bill_to_name, bill_to_gstin,
    franchise_mapping_type, invoice_category,
    source_document_ref, issued_at, issued_by
  ) VALUES (
    resolved_company, NEW.franchisee_id,
    new_doc_type, NEW.invoice_number, COALESCE(NEW.completed_at::date, CURRENT_DATE),
    COALESCE(NEW.subtotal,0), COALESCE(NEW.discount_amount,0),
    COALESCE(NEW.gst_total,0),
    COALESCE(NEW.cgst_amount,0), COALESCE(NEW.sgst_amount,0), COALESCE(NEW.igst_amount,0),
    COALESCE(NEW.grand_total,0),
    COALESCE(NEW.amount_paid,0), COALESCE(NEW.payment_status,'unpaid'), 'issued'::public.invoice_status,
    NEW.customer_name, NEW.customer_gstin,
    'city'::public.franchise_mapping_type,
    'tns_turnover'::public.invoice_category,
    'pos:' || NEW.id::text, now(), NEW.served_by
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mirror_pos_order_to_invoice ON public.sales_orders;
CREATE TRIGGER trg_mirror_pos_order_to_invoice
  AFTER INSERT OR UPDATE OF status ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.mirror_pos_order_to_invoice();

-- Backfill using the default company when null.
WITH fallback AS (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)
INSERT INTO public.invoices (
  company_id, franchisee_id,
  doc_type, invoice_number, invoice_date,
  subtotal, discount_total, gst_total, cgst_total, sgst_total, igst_total, grand_total,
  amount_paid, payment_status, status,
  bill_to_name, bill_to_gstin,
  franchise_mapping_type, invoice_category,
  source_document_ref, issued_at, issued_by
)
SELECT
  COALESCE(so.company_id, (SELECT id FROM fallback)),
  so.franchisee_id,
  CASE WHEN COALESCE(so.customer_gstin,'') <> '' THEN 'b2b_tax'::public.invoice_doc_type
       ELSE 'b2c'::public.invoice_doc_type END,
  so.invoice_number, COALESCE(so.completed_at::date, CURRENT_DATE),
  COALESCE(so.subtotal,0), COALESCE(so.discount_amount,0),
  COALESCE(so.gst_total,0),
  COALESCE(so.cgst_amount,0), COALESCE(so.sgst_amount,0), COALESCE(so.igst_amount,0),
  COALESCE(so.grand_total,0),
  COALESCE(so.amount_paid,0), COALESCE(so.payment_status,'unpaid'), 'issued'::public.invoice_status,
  so.customer_name, so.customer_gstin,
  'city'::public.franchise_mapping_type, 'tns_turnover'::public.invoice_category,
  'pos:' || so.id::text, COALESCE(so.completed_at, now()), so.served_by
FROM public.sales_orders so
WHERE so.status = 'completed'
  AND so.franchisee_id IS NOT NULL
  AND COALESCE(so.company_id, (SELECT id FROM fallback)) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.source_document_ref = ('pos:' || so.id::text)
  );

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT franchisee_id, date_trunc('month', invoice_date)::date AS m
    FROM public.invoices
    WHERE franchisee_id IS NOT NULL
      AND source_document_ref LIKE 'pos:%'
  LOOP
    PERFORM public.recompute_roi_payout(r.franchisee_id, r.m);
  END LOOP;
END $$;
