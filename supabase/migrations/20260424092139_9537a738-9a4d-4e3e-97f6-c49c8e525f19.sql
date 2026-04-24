
-- ============================================================
-- 1. DISPATCH TRACKING ON SALES ORDERS
-- ============================================================
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_tracking TEXT,
  ADD COLUMN IF NOT EXISTS dispatched_by UUID;

-- ============================================================
-- 2. PUBLIC INVOICE SHARE TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoice_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invoice_share_tokens_token ON public.invoice_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invoice_share_tokens_order ON public.invoice_share_tokens(order_id);

ALTER TABLE public.invoice_share_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "share token public read" ON public.invoice_share_tokens;
CREATE POLICY "share token public read" ON public.invoice_share_tokens
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "share token admin manage" ON public.invoice_share_tokens;
CREATE POLICY "share token admin manage" ON public.invoice_share_tokens
  FOR ALL USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'package_sales')
    OR public.has_role(auth.uid(), 'accounts')
    OR public.has_role(auth.uid(), 'nail_emporium')
  ) WITH CHECK (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'package_sales')
    OR public.has_role(auth.uid(), 'accounts')
    OR public.has_role(auth.uid(), 'nail_emporium')
  );

DROP POLICY IF EXISTS "sales_orders public via token" ON public.sales_orders;
CREATE POLICY "sales_orders public via token" ON public.sales_orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.invoice_share_tokens t WHERE t.order_id = sales_orders.id)
  );

DROP POLICY IF EXISTS "sales_order_items public via token" ON public.sales_order_items;
CREATE POLICY "sales_order_items public via token" ON public.sales_order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.invoice_share_tokens t WHERE t.order_id = sales_order_items.order_id)
  );

DROP POLICY IF EXISTS "sale_payments public via token" ON public.sale_payments;
CREATE POLICY "sale_payments public via token" ON public.sale_payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.invoice_share_tokens t WHERE t.order_id = sale_payments.order_id)
  );

DROP POLICY IF EXISTS "warehouses public via token" ON public.warehouses;
CREATE POLICY "warehouses public via token" ON public.warehouses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales_orders so
      JOIN public.invoice_share_tokens t ON t.order_id = so.id
      WHERE so.warehouse_id = warehouses.id
    )
  );

-- ============================================================
-- 3. WAREHOUSE ↔ FRANCHISEE TWO-WAY SYNC
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_warehouse_franchisee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'warehouses' THEN
    IF NEW.franchisee_id IS NOT NULL THEN
      UPDATE public.warehouses
        SET franchisee_id = NULL, updated_at = now()
        WHERE franchisee_id = NEW.franchisee_id AND id <> NEW.id;
      UPDATE public.franchisees
        SET warehouse_id = NEW.id, updated_at = now()
        WHERE id = NEW.franchisee_id AND (warehouse_id IS DISTINCT FROM NEW.id);
    ELSIF (TG_OP = 'UPDATE' AND OLD.franchisee_id IS NOT NULL) THEN
      UPDATE public.franchisees
        SET warehouse_id = NULL, updated_at = now()
        WHERE id = OLD.franchisee_id AND warehouse_id = NEW.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'franchisees' THEN
    IF NEW.warehouse_id IS NOT NULL THEN
      UPDATE public.warehouses
        SET franchisee_id = NEW.id, updated_at = now()
        WHERE id = NEW.warehouse_id AND (franchisee_id IS DISTINCT FROM NEW.id);
    ELSIF (TG_OP = 'UPDATE' AND OLD.warehouse_id IS NOT NULL) THEN
      UPDATE public.warehouses
        SET franchisee_id = NULL, updated_at = now()
        WHERE id = OLD.warehouse_id AND franchisee_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_warehouse_to_franchisee ON public.warehouses;
CREATE TRIGGER trg_sync_warehouse_to_franchisee
  AFTER INSERT OR UPDATE OF franchisee_id ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.sync_warehouse_franchisee();

DROP TRIGGER IF EXISTS trg_sync_franchisee_to_warehouse ON public.franchisees;
CREATE TRIGGER trg_sync_franchisee_to_warehouse
  AFTER INSERT OR UPDATE OF warehouse_id ON public.franchisees
  FOR EACH ROW EXECUTE FUNCTION public.sync_warehouse_franchisee();

-- ============================================================
-- 4. AUTO-DERIVE franchisee_id ON SALES_ORDERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.derive_sales_order_franchisee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.franchisee_id IS NULL AND NEW.warehouse_id IS NOT NULL THEN
    SELECT franchisee_id INTO NEW.franchisee_id
      FROM public.warehouses WHERE id = NEW.warehouse_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_derive_sales_order_franchisee ON public.sales_orders;
CREATE TRIGGER trg_derive_sales_order_franchisee
  BEFORE INSERT OR UPDATE OF warehouse_id ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.derive_sales_order_franchisee();

-- ============================================================
-- 5. ONE-TIME DATA FIX: vadodara → RAJESH TRADING + back-fill orders
-- ============================================================
DO $$
DECLARE
  v_warehouse_id UUID;
  v_franchisee_id UUID;
BEGIN
  SELECT id INTO v_warehouse_id FROM public.warehouses WHERE lower(name) = 'vadodara' LIMIT 1;
  SELECT id INTO v_franchisee_id FROM public.franchisees WHERE full_name ILIKE '%RAJESH TRADING%' LIMIT 1;
  IF v_warehouse_id IS NOT NULL AND v_franchisee_id IS NOT NULL THEN
    UPDATE public.warehouses SET franchisee_id = v_franchisee_id WHERE id = v_warehouse_id;
    UPDATE public.sales_orders
      SET franchisee_id = v_franchisee_id
      WHERE warehouse_id = v_warehouse_id AND franchisee_id IS NULL;
  END IF;
END $$;

-- ============================================================
-- 6. NEGATIVE STOCK CLEANUP
-- ============================================================
INSERT INTO public.audit_logs (action, entity, metadata)
SELECT 'stock_reset_negative_to_zero', 'stock_levels',
       jsonb_build_object('product_id', product_id, 'warehouse_id', warehouse_id, 'old_qty', quantity)
  FROM public.stock_levels WHERE quantity < 0;

UPDATE public.stock_levels SET quantity = 0, updated_at = now() WHERE quantity < 0;

-- ============================================================
-- 7. WEBINAR ITEMS IN REVENUE MODEL
-- ============================================================
INSERT INTO public.revenue_model_items
  (category, particulars, description, mrp, offer_value, offer_cost,
   target_segment, default_target, franchisee_roi_pct, state_partner_pct, sort_order, active)
SELECT 'MMA Program', 'Big Coach Webinar',
       'Live mentor-led webinar series for established artists',
       9999, 4999, 800, 'artists', 0, 3, 10,
       COALESCE((SELECT MAX(sort_order) FROM public.revenue_model_items WHERE category='MMA Program'),0)+1,
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.revenue_model_items
  WHERE lower(particulars) = 'big coach webinar' AND category = 'MMA Program'
);

INSERT INTO public.revenue_model_items
  (category, particulars, description, mrp, offer_value, offer_cost,
   target_segment, default_target, franchisee_roi_pct, state_partner_pct, sort_order, active)
SELECT 'MMA Program', 'Nail Coach Webinar',
       'Live mentor-led webinar series for nail-art beginners',
       4999, 2499, 400, 'beginners', 0, 3, 10,
       COALESCE((SELECT MAX(sort_order) FROM public.revenue_model_items WHERE category='MMA Program'),0)+1,
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.revenue_model_items
  WHERE lower(particulars) = 'nail coach webinar' AND category = 'MMA Program'
);

-- ============================================================
-- 8. RLS GRANTS FOR NAIL EMPORIUM
-- ============================================================
DROP POLICY IF EXISTS "inv_p_emporium_all" ON public.products;
CREATE POLICY "inv_p_emporium_all" ON public.products
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "inv_pc_emporium_all" ON public.product_categories;
CREATE POLICY "inv_pc_emporium_all" ON public.product_categories
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "inv_po_emporium_all" ON public.purchase_orders;
CREATE POLICY "inv_po_emporium_all" ON public.purchase_orders
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "inv_poi_emporium_all" ON public.purchase_order_items;
CREATE POLICY "inv_poi_emporium_all" ON public.purchase_order_items
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "stock_emporium_all" ON public.stock_levels;
CREATE POLICY "stock_emporium_all" ON public.stock_levels
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "stockmv_emporium_all" ON public.stock_movements;
CREATE POLICY "stockmv_emporium_all" ON public.stock_movements
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "wh_emporium_all" ON public.warehouses;
CREATE POLICY "wh_emporium_all" ON public.warehouses
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "supp_emporium_all" ON public.suppliers;
CREATE POLICY "supp_emporium_all" ON public.suppliers
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "so_emporium_all" ON public.sales_orders;
CREATE POLICY "so_emporium_all" ON public.sales_orders
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "soi_emporium_all" ON public.sales_order_items;
CREATE POLICY "soi_emporium_all" ON public.sales_order_items
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "sp_emporium_all" ON public.sale_payments;
CREATE POLICY "sp_emporium_all" ON public.sale_payments
  FOR ALL USING (public.has_role(auth.uid(), 'nail_emporium'))
  WITH CHECK (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "rev_emporium_read" ON public.revenue_entries;
CREATE POLICY "rev_emporium_read" ON public.revenue_entries
  FOR SELECT USING (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "exp_emporium_read" ON public.expenses;
CREATE POLICY "exp_emporium_read" ON public.expenses
  FOR SELECT USING (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "roi_emporium_read" ON public.roi_payouts;
CREATE POLICY "roi_emporium_read" ON public.roi_payouts
  FOR SELECT USING (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "fr_emporium_read" ON public.franchisees;
CREATE POLICY "fr_emporium_read" ON public.franchisees
  FOR SELECT USING (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "leads_emporium_read" ON public.leads;
CREATE POLICY "leads_emporium_read" ON public.leads
  FOR SELECT USING (public.has_role(auth.uid(), 'nail_emporium'));

DROP POLICY IF EXISTS "leadact_emporium_read" ON public.lead_activities;
CREATE POLICY "leadact_emporium_read" ON public.lead_activities
  FOR SELECT USING (public.has_role(auth.uid(), 'nail_emporium'));
