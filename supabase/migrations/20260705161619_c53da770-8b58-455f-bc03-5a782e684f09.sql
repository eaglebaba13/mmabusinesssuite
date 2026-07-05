
-- 1) Product master ab territory-free
ALTER TABLE public.franchise_products DROP COLUMN IF EXISTS territory;

-- 2) Franchisee level pe territory + onboarding fields
ALTER TABLE public.franchisees
  ADD COLUMN IF NOT EXISTS territory_country text,
  ADD COLUMN IF NOT EXISTS territory_state text,
  ADD COLUMN IF NOT EXISTS territory_district text,
  ADD COLUMN IF NOT EXISTS territory_city text,
  ADD COLUMN IF NOT EXISTS territory_area text,
  ADD COLUMN IF NOT EXISTS territory_pincode text,
  ADD COLUMN IF NOT EXISTS territory_radius_km numeric,
  ADD COLUMN IF NOT EXISTS territory_exclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS territory_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS territory_start_date date,
  ADD COLUMN IF NOT EXISTS territory_end_date date,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_executive_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agreement_number text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS gst_number text,
  ADD COLUMN IF NOT EXISTS pan_number text,
  ADD COLUMN IF NOT EXISTS aadhaar_number text;

CREATE INDEX IF NOT EXISTS idx_franchisees_territory_pincode ON public.franchisees(territory_pincode);
CREATE INDEX IF NOT EXISTS idx_franchisees_territory_city ON public.franchisees(territory_city);
CREATE INDEX IF NOT EXISTS idx_franchisees_manager ON public.franchisees(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_franchisees_sales_exec ON public.franchisees(sales_executive_user_id);
