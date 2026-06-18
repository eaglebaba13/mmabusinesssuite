
-- audit_logs: admin-only insert
DROP POLICY IF EXISTS "audit insert" ON public.audit_logs;
CREATE POLICY "audit admin insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- franchisee_credentials: only super admin/founder may read plaintext temp passwords
DROP POLICY IF EXISTS "fc admin select" ON public.franchisee_credentials;
CREATE POLICY "fc admin select" ON public.franchisee_credentials
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- state_franchise_credentials: same restriction
DROP POLICY IF EXISTS "sfc admin select" ON public.state_franchise_credentials;
CREATE POLICY "sfc admin select" ON public.state_franchise_credentials
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- invoice_share_tokens: restrict public read to non-expired tokens (limits enumeration window)
DROP POLICY IF EXISTS "share token public read" ON public.invoice_share_tokens;
CREATE POLICY "share token public read" ON public.invoice_share_tokens
  FOR SELECT TO anon, authenticated
  USING (expires_at IS NULL OR expires_at > now());

-- sales_orders/sale_payments/sales_order_items public-via-token: add expiry check
DROP POLICY IF EXISTS "sales_orders public via token" ON public.sales_orders;
CREATE POLICY "sales_orders public via token" ON public.sales_orders
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoice_share_tokens t
    WHERE t.order_id = sales_orders.id
      AND (t.expires_at IS NULL OR t.expires_at > now())
  ));

DROP POLICY IF EXISTS "sale_payments public via token" ON public.sale_payments;
CREATE POLICY "sale_payments public via token" ON public.sale_payments
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoice_share_tokens t
    WHERE t.order_id = sale_payments.order_id
      AND (t.expires_at IS NULL OR t.expires_at > now())
  ));

DROP POLICY IF EXISTS "sales_order_items public via token" ON public.sales_order_items;
CREATE POLICY "sales_order_items public via token" ON public.sales_order_items
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoice_share_tokens t
    WHERE t.order_id = sales_order_items.order_id
      AND (t.expires_at IS NULL OR t.expires_at > now())
  ));

DROP POLICY IF EXISTS "warehouses public via token" ON public.warehouses;
CREATE POLICY "warehouses public via token" ON public.warehouses
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_orders so
    JOIN public.invoice_share_tokens t ON t.order_id = so.id
    WHERE so.warehouse_id = warehouses.id
      AND (t.expires_at IS NULL OR t.expires_at > now())
  ));

-- leads: restrict insert
DROP POLICY IF EXISTS "leads insert" ON public.leads;
CREATE POLICY "leads insert" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'sales'::app_role));

-- org_settings: hide webhook secret from non-admins
DROP POLICY IF EXISTS "settings read" ON public.org_settings;
CREATE POLICY "settings read" ON public.org_settings
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accounts'::app_role));

-- social_integrations: only admins may write/full access; sales gets read-only
DROP POLICY IF EXISTS "si admin all" ON public.social_integrations;
CREATE POLICY "si admin all" ON public.social_integrations
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "si sales read" ON public.social_integrations;
CREATE POLICY "si sales read" ON public.social_integrations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'sales'::app_role));

-- storage.objects: tighten invoice-sources bucket read
DROP POLICY IF EXISTS "invoice_sources_read" ON storage.objects;
CREATE POLICY "invoice_sources_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-sources'
    AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(), 'accounts'::app_role)
      OR public.has_role(auth.uid(), 'nail_emporium'::app_role)
    )
  );
