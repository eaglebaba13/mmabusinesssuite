DROP POLICY IF EXISTS "revenue_splits_read_auth" ON public.franchise_revenue_model_splits;
CREATE POLICY "revenue_splits_assigned_read"
ON public.franchise_revenue_model_splits
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.franchise_products fp
    JOIN public.franchisees f ON f.franchise_product_id = fp.id
    WHERE fp.revenue_model_id = franchise_revenue_model_splits.model_id
      AND f.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "products_read_authenticated" ON public.franchise_products;
CREATE POLICY "products_admin_or_assigned_read"
ON public.franchise_products
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.franchisees f
    WHERE f.franchise_product_id = franchise_products.id
      AND f.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "product_commissions_read_auth" ON public.franchise_product_commissions;
CREATE POLICY "product_commissions_assigned_read"
ON public.franchise_product_commissions
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.franchisees f
    WHERE f.franchise_product_id = franchise_product_commissions.product_id
      AND f.user_id = auth.uid()
  )
);