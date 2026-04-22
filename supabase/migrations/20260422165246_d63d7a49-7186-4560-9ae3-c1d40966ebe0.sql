-- 1. Extend franchisees with onboarding spec
ALTER TABLE public.franchisees
  ADD COLUMN IF NOT EXISTS franchise_fee numeric NOT NULL DEFAULT 500000,
  ADD COLUMN IF NOT EXISTS base_roi_pct numeric NOT NULL DEFAULT 3.00,
  ADD COLUMN IF NOT EXISTS emporium_pct numeric NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS academy_pct numeric NOT NULL DEFAULT 3.00,
  ADD COLUMN IF NOT EXISTS dark_store_pct numeric NOT NULL DEFAULT 3.00,
  ADD COLUMN IF NOT EXISTS area_sqft numeric,
  ADD COLUMN IF NOT EXISTS chairs int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS tables_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cctv_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS computer_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS printer_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS equipment_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS equipment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);

-- 2. Credentials table
CREATE TABLE IF NOT EXISTS public.franchisee_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchisee_id uuid NOT NULL REFERENCES public.franchisees(id) ON DELETE CASCADE,
  login_email text NOT NULL,
  temp_password text NOT NULL,
  delivered boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.franchisee_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fc admin select" ON public.franchisee_credentials;
CREATE POLICY "fc admin select" ON public.franchisee_credentials
  FOR SELECT USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(),'accounts')
  );

DROP POLICY IF EXISTS "fc admin insert" ON public.franchisee_credentials;
CREATE POLICY "fc admin insert" ON public.franchisee_credentials
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "fc admin update" ON public.franchisee_credentials;
CREATE POLICY "fc admin update" ON public.franchisee_credentials
  FOR UPDATE USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "fc admin delete" ON public.franchisee_credentials;
CREATE POLICY "fc admin delete" ON public.franchisee_credentials
  FOR DELETE USING (public.is_admin(auth.uid()));

-- 3. Let franchisees read their own warehouse + stock levels (read only)
DROP POLICY IF EXISTS "wh franchisee read own" ON public.warehouses;
CREATE POLICY "wh franchisee read own" ON public.warehouses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.franchisees f
      WHERE f.warehouse_id = warehouses.id
        AND f.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sl franchisee read own" ON public.stock_levels;
CREATE POLICY "sl franchisee read own" ON public.stock_levels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.franchisees f
      WHERE f.warehouse_id = stock_levels.warehouse_id
        AND f.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "products franchisee read" ON public.products;
CREATE POLICY "products franchisee read" ON public.products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.franchisees f
      WHERE f.user_id = auth.uid()
    )
  );