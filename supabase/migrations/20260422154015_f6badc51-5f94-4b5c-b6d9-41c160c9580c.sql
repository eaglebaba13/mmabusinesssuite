-- POS / Billing module schema

-- Enums
CREATE TYPE public.pos_payment_method AS ENUM ('cash','upi','card','bank_transfer','wallet','credit');
CREATE TYPE public.pos_payment_status AS ENUM ('unpaid','partial','paid','refunded');
CREATE TYPE public.pos_order_status AS ENUM ('draft','completed','cancelled','refunded');

-- Sequence for invoice numbering (year-based)
CREATE SEQUENCE IF NOT EXISTS public.sales_invoice_seq START 1;

-- Sales orders (invoices)
CREATE TABLE public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  franchisee_id UUID REFERENCES public.franchisees(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_gstin TEXT,
  customer_address TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  cgst_amount NUMERIC NOT NULL DEFAULT 0,
  sgst_amount NUMERIC NOT NULL DEFAULT 0,
  igst_amount NUMERIC NOT NULL DEFAULT 0,
  gst_total NUMERIC NOT NULL DEFAULT 0,
  grand_total NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  payment_status public.pos_payment_status NOT NULL DEFAULT 'unpaid',
  status public.pos_order_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  served_by UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_orders_warehouse ON public.sales_orders(warehouse_id);
CREATE INDEX idx_sales_orders_status ON public.sales_orders(status);
CREATE INDEX idx_sales_orders_created ON public.sales_orders(created_at DESC);

-- Sales order items
CREATE TABLE public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  sku TEXT,
  hsn_code TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  discount_pct NUMERIC NOT NULL DEFAULT 0,
  gst_pct NUMERIC NOT NULL DEFAULT 18,
  line_subtotal NUMERIC NOT NULL DEFAULT 0,
  line_gst NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_soi_order ON public.sales_order_items(order_id);

-- Split payments
CREATE TABLE public.sale_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  method public.pos_payment_method NOT NULL DEFAULT 'cash',
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sp_order ON public.sale_payments(order_id);

-- Updated_at triggers
CREATE TRIGGER trg_sales_orders_updated BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto invoice number on completion
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yr TEXT;
  n INT;
BEGIN
  IF NEW.invoice_number IS NULL AND (NEW.status = 'completed' OR (TG_OP = 'INSERT' AND NEW.status = 'completed')) THEN
    yr := to_char(now(), 'YYYY');
    n := nextval('public.sales_invoice_seq');
    NEW.invoice_number := 'INV-' || yr || '-' || lpad(n::text, 5, '0');
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_sales_orders_invoice
  BEFORE INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- Recalc totals when items change
CREATE OR REPLACE FUNCTION public.recalc_sales_order_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  oid UUID;
  sub NUMERIC; disc NUMERIC; gst NUMERIC; grand NUMERIC;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);
  SELECT
    COALESCE(SUM(line_subtotal),0),
    COALESCE(SUM(line_subtotal * discount_pct / 100),0),
    COALESCE(SUM(line_gst),0),
    COALESCE(SUM(line_total),0)
  INTO sub, disc, gst, grand
  FROM public.sales_order_items WHERE order_id = oid;

  UPDATE public.sales_orders SET
    subtotal = sub,
    discount_amount = disc,
    gst_total = gst,
    cgst_amount = gst / 2,
    sgst_amount = gst / 2,
    grand_total = grand,
    updated_at = now()
  WHERE id = oid;
  RETURN NULL;
END$$;

CREATE TRIGGER trg_recalc_totals_ai AFTER INSERT ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_sales_order_totals();
CREATE TRIGGER trg_recalc_totals_au AFTER UPDATE ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_sales_order_totals();
CREATE TRIGGER trg_recalc_totals_ad AFTER DELETE ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_sales_order_totals();

-- Auto-compute line totals before insert/update
CREATE OR REPLACE FUNCTION public.compute_line_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base NUMERIC;
  after_disc NUMERIC;
BEGIN
  base := NEW.quantity * NEW.unit_price;
  after_disc := base - (base * COALESCE(NEW.discount_pct,0) / 100);
  NEW.line_subtotal := after_disc;
  NEW.line_gst := after_disc * COALESCE(NEW.gst_pct,0) / 100;
  NEW.line_total := after_disc + NEW.line_gst;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_compute_line_totals
  BEFORE INSERT OR UPDATE ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_line_totals();

-- Update payment_status & amount_paid when payments change
CREATE OR REPLACE FUNCTION public.recalc_payment_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  oid UUID;
  total_paid NUMERIC;
  grand NUMERIC;
  ps public.pos_payment_status;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);
  SELECT COALESCE(SUM(amount),0) INTO total_paid FROM public.sale_payments WHERE order_id = oid;
  SELECT grand_total INTO grand FROM public.sales_orders WHERE id = oid;
  IF total_paid <= 0 THEN ps := 'unpaid';
  ELSIF total_paid < grand THEN ps := 'partial';
  ELSE ps := 'paid';
  END IF;
  UPDATE public.sales_orders SET amount_paid = total_paid, payment_status = ps, updated_at = now() WHERE id = oid;
  RETURN NULL;
END$$;

CREATE TRIGGER trg_recalc_payment_ai AFTER INSERT ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_payment_status();
CREATE TRIGGER trg_recalc_payment_au AFTER UPDATE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_payment_status();
CREATE TRIGGER trg_recalc_payment_ad AFTER DELETE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_payment_status();

-- Deduct stock on order completion
CREATE OR REPLACE FUNCTION public.deduct_stock_on_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  itm RECORD;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.warehouse_id IS NOT NULL THEN
    FOR itm IN SELECT product_id, quantity FROM public.sales_order_items WHERE order_id = NEW.id LOOP
      INSERT INTO public.stock_movements (product_id, source_warehouse_id, quantity, movement_type, reference_type, reference_id, recorded_by, reason)
      VALUES (itm.product_id, NEW.warehouse_id, itm.quantity, 'sale_out', 'sales_order', NEW.id, NEW.served_by, 'POS sale ' || COALESCE(NEW.invoice_number,''));
    END LOOP;
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_deduct_stock_completion
  AFTER UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.deduct_stock_on_completion();

-- Enable RLS
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

-- RLS: admin / package_sales / accounts full access; franchisee sees own
CREATE POLICY "pos_orders_admin_all" ON public.sales_orders FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'package_sales') OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'package_sales') OR has_role(auth.uid(),'accounts'));

CREATE POLICY "pos_orders_franchisee_read" ON public.sales_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM franchisees f WHERE f.id = sales_orders.franchisee_id AND f.user_id = auth.uid()));

CREATE POLICY "pos_items_admin_all" ON public.sales_order_items FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'package_sales') OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'package_sales') OR has_role(auth.uid(),'accounts'));

CREATE POLICY "pos_items_franchisee_read" ON public.sales_order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM sales_orders so JOIN franchisees f ON f.id = so.franchisee_id WHERE so.id = sales_order_items.order_id AND f.user_id = auth.uid()));

CREATE POLICY "pos_payments_admin_all" ON public.sale_payments FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'package_sales') OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'package_sales') OR has_role(auth.uid(),'accounts'));

CREATE POLICY "pos_payments_franchisee_read" ON public.sale_payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM sales_orders so JOIN franchisees f ON f.id = so.franchisee_id WHERE so.id = sale_payments.order_id AND f.user_id = auth.uid()));