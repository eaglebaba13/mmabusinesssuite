
-- Extend invoice_category with 'membership' if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname='invoice_category' AND e.enumlabel='membership') THEN
    ALTER TYPE public.invoice_category ADD VALUE 'membership';
  END IF;
END $$;

-- Columns on sales_orders
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS franchise_mapping_type public.franchise_mapping_type,
  ADD COLUMN IF NOT EXISTS invoice_category       public.invoice_category;

-- Validation: a completed franchise sale must carry mapping + category
CREATE OR REPLACE FUNCTION public.validate_pos_order_mapping()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF NEW.franchise_mapping_type IS NULL THEN
      RAISE EXCEPTION 'Billing Under is required to complete the sale.' USING ERRCODE='check_violation';
    END IF;
    IF NEW.franchise_mapping_type <> 'company_direct' AND NEW.franchisee_id IS NULL THEN
      RAISE EXCEPTION 'A franchise must be selected for non-direct billing.' USING ERRCODE='check_violation';
    END IF;
    IF NEW.franchise_mapping_type <> 'company_direct' AND NEW.invoice_category IS NULL THEN
      RAISE EXCEPTION 'Sale Category is required for franchise billing.' USING ERRCODE='check_violation';
    END IF;
    -- Only active franchises may receive billing
    IF NEW.franchisee_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.franchisees f WHERE f.id = NEW.franchisee_id AND f.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Selected franchise is not active.' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_pos_order_mapping ON public.sales_orders;
CREATE TRIGGER trg_validate_pos_order_mapping
  BEFORE INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_pos_order_mapping();

-- Update mirror trigger to honor per-order mapping and category
CREATE OR REPLACE FUNCTION public.mirror_pos_order_to_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_doc_type public.invoice_doc_type;
  resolved_company uuid;
  mapping public.franchise_mapping_type;
  category public.invoice_category;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;

  mapping  := COALESCE(NEW.franchise_mapping_type, 'company_direct'::public.franchise_mapping_type);
  category := COALESCE(NEW.invoice_category, 'other'::public.invoice_category);

  -- Company Direct sales do NOT map to a franchise → skip ROI mirroring
  IF mapping = 'company_direct' OR NEW.franchisee_id IS NULL THEN
    RETURN NEW;
  END IF;

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
    mapping, category,
    'pos:' || NEW.id::text, now(), NEW.served_by
  );

  RETURN NEW;
END $$;
