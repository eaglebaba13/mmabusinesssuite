-- 1. Sync mirrored franchise invoice payment state from POS payments
CREATE OR REPLACE FUNCTION public.sync_mirrored_invoice_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  inv_id uuid;
  paid numeric;
  grand numeric;
  ps public.pos_payment_status;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);
  IF oid IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO inv_id FROM public.invoices
    WHERE source_document_ref = 'pos:' || oid::text
    LIMIT 1;
  IF inv_id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.sale_payments WHERE order_id = oid;
  SELECT grand_total INTO grand FROM public.invoices WHERE id = inv_id;

  IF paid <= 0 THEN ps := 'unpaid';
  ELSIF paid < COALESCE(grand,0) THEN ps := 'partial';
  ELSE ps := 'paid';
  END IF;

  UPDATE public.invoices
    SET amount_paid = paid, payment_status = ps, updated_at = now()
    WHERE id = inv_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_mirrored_invoice_payment_ai ON public.sale_payments;
DROP TRIGGER IF EXISTS trg_sync_mirrored_invoice_payment_au ON public.sale_payments;
DROP TRIGGER IF EXISTS trg_sync_mirrored_invoice_payment_ad ON public.sale_payments;
CREATE TRIGGER trg_sync_mirrored_invoice_payment_ai AFTER INSERT ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_mirrored_invoice_payment();
CREATE TRIGGER trg_sync_mirrored_invoice_payment_au AFTER UPDATE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_mirrored_invoice_payment();
CREATE TRIGGER trg_sync_mirrored_invoice_payment_ad AFTER DELETE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_mirrored_invoice_payment();

-- Also sync when a POS order's own payment totals change (e.g. mirror created later)
CREATE OR REPLACE FUNCTION public.sync_mirrored_invoice_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_id uuid; grand numeric; paid numeric; ps public.pos_payment_status;
BEGIN
  SELECT id, grand_total INTO inv_id, grand FROM public.invoices
    WHERE source_document_ref = 'pos:' || NEW.id::text LIMIT 1;
  IF inv_id IS NULL THEN RETURN NULL; END IF;
  paid := COALESCE(NEW.amount_paid, 0);
  IF paid <= 0 THEN ps := 'unpaid';
  ELSIF paid < COALESCE(grand,0) THEN ps := 'partial';
  ELSE ps := 'paid';
  END IF;
  UPDATE public.invoices SET amount_paid = paid, payment_status = ps, updated_at = now()
    WHERE id = inv_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_mirrored_invoice_from_order ON public.sales_orders;
CREATE TRIGGER trg_sync_mirrored_invoice_from_order AFTER UPDATE OF amount_paid, payment_status
  ON public.sales_orders FOR EACH ROW
  EXECUTE FUNCTION public.sync_mirrored_invoice_from_order();

-- 2. Security: stop public enumeration of invoice share tokens
DROP POLICY IF EXISTS "share token public read" ON public.invoice_share_tokens;
DROP POLICY IF EXISTS "sales_orders public via token" ON public.sales_orders;
DROP POLICY IF EXISTS "sales_order_items public via token" ON public.sales_order_items;
DROP POLICY IF EXISTS "sale_payments public via token" ON public.sale_payments;
DROP POLICY IF EXISTS "warehouses public via token" ON public.warehouses;

CREATE OR REPLACE FUNCTION public.get_public_invoice(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  result jsonb;
BEGIN
  SELECT t.order_id INTO oid
  FROM public.invoice_share_tokens t
  WHERE t.token = _token
    AND (t.expires_at IS NULL OR t.expires_at > now())
  LIMIT 1;

  IF oid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'order', to_jsonb(so) - 'served_by' - 'company_id' || jsonb_build_object(
        'warehouses', (SELECT jsonb_build_object('name', w.name, 'address', w.address, 'city', w.city, 'state', w.state)
                       FROM public.warehouses w WHERE w.id = so.warehouse_id)),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at)
                       FROM public.sales_order_items i WHERE i.order_id = so.id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.paid_at)
                       FROM public.sale_payments p WHERE p.order_id = so.id), '[]'::jsonb)
  ) INTO result
  FROM public.sales_orders so
  WHERE so.id = oid;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.get_public_invoice(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_invoice(text) TO anon, authenticated;