
-- =========================================================
-- Franchise Products Module — Phase 1 foundation
-- =========================================================

-- 1. Franchise Product Types (master, state, city, FOCO, COFO, distributor, academy, cloud nail bar, ...)
CREATE TABLE public.franchise_product_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.franchise_product_types TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.franchise_product_types TO authenticated;
GRANT ALL ON public.franchise_product_types TO service_role;
ALTER TABLE public.franchise_product_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "types_read_authenticated"
  ON public.franchise_product_types FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "types_admin_write"
  ON public.franchise_product_types FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_franchise_product_types_updated
  BEFORE UPDATE ON public.franchise_product_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed common types
INSERT INTO public.franchise_product_types (code, label, is_system, sort_order) VALUES
  ('master',            'Master Franchise',       true, 10),
  ('state',             'State Franchise',        true, 20),
  ('city',              'City Franchise',         true, 30),
  ('area',              'Area Franchise',         true, 40),
  ('district',          'District Franchise',     true, 50),
  ('academy',           'Academy Franchise',      true, 60),
  ('foco',              'FOCO',                   true, 70),
  ('cofo',              'COFO',                   true, 80),
  ('distributor',       'Distributor',            true, 90),
  ('super_distributor', 'Super Distributor',      true, 100),
  ('cloud_nail_bar',    'Cloud Nail Bar',         true, 110),
  ('luxury_salon',      'Luxury Salon',           true, 120),
  ('express_salon',     'Express Salon',          true, 130),
  ('kiosk',             'Kiosk Model',            true, 140),
  ('beauty_academy',    'Beauty Academy',         true, 150),
  ('spa',               'Spa Franchise',          true, 160),
  ('product_distribution','Product Distribution', true, 170),
  ('dark_store',        'Dark Store',             true, 180),
  ('multi_brand_store', 'Multi Brand Store',      true, 190);

-- 2. Revenue Models (reusable across products)
CREATE TABLE public.franchise_revenue_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_revenue_models TO authenticated;
GRANT ALL ON public.franchise_revenue_models TO service_role;
ALTER TABLE public.franchise_revenue_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revenue_models_read_auth"
  ON public.franchise_revenue_models FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "revenue_models_admin_write"
  ON public.franchise_revenue_models FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_franchise_revenue_models_updated
  BEFORE UPDATE ON public.franchise_revenue_models
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.franchise_revenue_model_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.franchise_revenue_models(id) ON DELETE CASCADE,
  party_label text NOT NULL,           -- e.g. "Salon Operations", "Company", "Master Franchise"
  percent numeric(6,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_revenue_model_splits TO authenticated;
GRANT ALL ON public.franchise_revenue_model_splits TO service_role;
ALTER TABLE public.franchise_revenue_model_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revenue_splits_read_auth"
  ON public.franchise_revenue_model_splits FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "revenue_splits_admin_write"
  ON public.franchise_revenue_model_splits FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_rev_splits_model ON public.franchise_revenue_model_splits(model_id);

-- Seed the 4 example models
DO $$
DECLARE m_a uuid; m_b uuid; m_c uuid; m_d uuid;
BEGIN
  INSERT INTO public.franchise_revenue_models(code,name,description)
    VALUES ('model_a','Model A — Salon Operations','Salon operations split with master + company')
    RETURNING id INTO m_a;
  INSERT INTO public.franchise_revenue_model_splits(model_id,party_label,percent,sort_order) VALUES
    (m_a,'Salon Operations',50,10),
    (m_a,'Franchise Owner',20,20),
    (m_a,'Marketing',10,30),
    (m_a,'Master Franchise',5,40),
    (m_a,'Company',15,50);

  INSERT INTO public.franchise_revenue_models(code,name,description)
    VALUES ('model_b','Model B — FOCO','Company owned / franchise operated')
    RETURNING id INTO m_b;
  INSERT INTO public.franchise_revenue_model_splits(model_id,party_label,percent,sort_order) VALUES
    (m_b,'Company',70,10),
    (m_b,'Operator',30,20);

  INSERT INTO public.franchise_revenue_models(code,name,description)
    VALUES ('model_c','Model C — Distributor','Margin-based distribution')
    RETURNING id INTO m_c;
  INSERT INTO public.franchise_revenue_model_splits(model_id,party_label,percent,sort_order) VALUES
    (m_c,'Distributor Margin',100,10);

  INSERT INTO public.franchise_revenue_models(code,name,description)
    VALUES ('model_d','Model D — Royalty Only','Fixed royalty percent')
    RETURNING id INTO m_d;
  INSERT INTO public.franchise_revenue_model_splits(model_id,party_label,percent,sort_order) VALUES
    (m_d,'Royalty',100,10);
END $$;

-- 3. Franchise Products (the core catalog)
CREATE TABLE public.franchise_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand_name text,
  brand_logo_url text,
  category text,
  type_id uuid REFERENCES public.franchise_product_types(id) ON DELETE SET NULL,
  revenue_model_id uuid REFERENCES public.franchise_revenue_models(id) ON DELETE SET NULL,

  investment_amount numeric(14,2) NOT NULL DEFAULT 0,
  gst_percent numeric(5,2) NOT NULL DEFAULT 18,
  security_deposit numeric(14,2) NOT NULL DEFAULT 0,
  lock_in_months integer NOT NULL DEFAULT 0,
  territory text,

  royalty_percent numeric(5,2) NOT NULL DEFAULT 0,
  revenue_share_percent numeric(5,2) NOT NULL DEFAULT 0,
  minimum_guarantee numeric(14,2) NOT NULL DEFAULT 0,
  expected_roi_percent numeric(6,2),
  roi_timeline_months integer,
  profit_margin_percent numeric(5,2),

  brochure_url text,
  video_url text,
  agreement_template text,

  short_description text,
  long_description text,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,     -- ["3-day training","National marketing"]
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["500 sqft space","2 staff"]

  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived','draft')),
  is_featured boolean NOT NULL DEFAULT false,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_products TO authenticated;
GRANT ALL ON public.franchise_products TO service_role;
ALTER TABLE public.franchise_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_read_authenticated"
  ON public.franchise_products FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "products_admin_write"
  ON public.franchise_products FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_franchise_products_type ON public.franchise_products(type_id);
CREATE INDEX idx_franchise_products_status ON public.franchise_products(status);
CREATE INDEX idx_franchise_products_featured ON public.franchise_products(is_featured) WHERE is_featured;

CREATE TRIGGER trg_franchise_products_updated
  BEFORE UPDATE ON public.franchise_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Product Media (gallery images, brochures, videos, documents)
CREATE TABLE public.franchise_product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.franchise_products(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('logo','image','video','brochure','document','marketing_kit')),
  url text NOT NULL,
  storage_path text,
  file_name text,
  file_size_bytes bigint,
  content_type text,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_product_media TO authenticated;
GRANT ALL ON public.franchise_product_media TO service_role;
ALTER TABLE public.franchise_product_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_media_read_auth"
  ON public.franchise_product_media FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "product_media_admin_write"
  ON public.franchise_product_media FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_product_media_product ON public.franchise_product_media(product_id);
CREATE INDEX idx_product_media_kind ON public.franchise_product_media(product_id, kind);

-- 5. Commission Structure per product
CREATE TABLE public.franchise_product_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.franchise_products(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('one_time','monthly','royalty','profit_share','recurring','bonus','performance_incentive','referral_bonus')),
  label text NOT NULL,
  amount numeric(14,2),
  percent numeric(6,2),
  frequency text CHECK (frequency IN ('one_time','monthly','quarterly','yearly','on_event')),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_product_commissions TO authenticated;
GRANT ALL ON public.franchise_product_commissions TO service_role;
ALTER TABLE public.franchise_product_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_commissions_read_auth"
  ON public.franchise_product_commissions FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "product_commissions_admin_write"
  ON public.franchise_product_commissions FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_product_commissions_product ON public.franchise_product_commissions(product_id);

-- 6. Link products to existing franchisees (optional soft-link, so historical rows are unaffected)
ALTER TABLE public.franchisees
  ADD COLUMN IF NOT EXISTS franchise_product_id uuid REFERENCES public.franchise_products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_franchisees_product ON public.franchisees(franchise_product_id);

-- Link leads to a product interest
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS franchise_product_id uuid REFERENCES public.franchise_products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_product ON public.leads(franchise_product_id);
