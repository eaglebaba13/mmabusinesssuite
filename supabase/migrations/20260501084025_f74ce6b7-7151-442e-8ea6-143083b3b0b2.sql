-- 1. Add new role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'state_franchisee';

-- 2. State franchises table
CREATE TABLE public.state_franchises (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  full_name text NOT NULL,
  email text,
  phone text,
  state text NOT NULL,
  investment_amount numeric NOT NULL DEFAULT 0,
  state_partner_pct numeric NOT NULL DEFAULT 10,
  joined_at date NOT NULL DEFAULT CURRENT_DATE,
  status public.franchisee_status NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_state_franchises_user_id ON public.state_franchises(user_id);
CREATE INDEX idx_state_franchises_state ON public.state_franchises(state);

CREATE TRIGGER trg_state_franchises_updated_at
  BEFORE UPDATE ON public.state_franchises
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.state_franchises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sf admin all" ON public.state_franchises FOR ALL TO public
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accounts'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accounts'::app_role));

CREATE POLICY "sf self read" ON public.state_franchises FOR SELECT TO public
  USING (auth.uid() = user_id);

-- 3. Credentials table
CREATE TABLE public.state_franchise_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state_franchise_id uuid NOT NULL REFERENCES public.state_franchises(id) ON DELETE CASCADE,
  login_email text NOT NULL,
  temp_password text NOT NULL,
  delivered boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.state_franchise_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sfc admin select" ON public.state_franchise_credentials FOR SELECT TO public
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accounts'::app_role));
CREATE POLICY "sfc admin insert" ON public.state_franchise_credentials FOR INSERT TO public
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "sfc admin update" ON public.state_franchise_credentials FOR UPDATE TO public
  USING (public.is_admin(auth.uid()));
CREATE POLICY "sfc admin delete" ON public.state_franchise_credentials FOR DELETE TO public
  USING (public.is_admin(auth.uid()));

-- 4. Link territories -> state franchise
ALTER TABLE public.territories
  ADD COLUMN state_franchise_id uuid REFERENCES public.state_franchises(id) ON DELETE SET NULL;

CREATE INDEX idx_territories_state_franchise ON public.territories(state_franchise_id);

-- 5. Helper: does this user own this territory through a state franchise?
CREATE OR REPLACE FUNCTION public.state_franchise_owns_territory(_user_id uuid, _territory_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.territories t
    JOIN public.state_franchises sf ON sf.id = t.state_franchise_id
    WHERE t.id = _territory_id AND sf.user_id = _user_id
  )
$$;

-- Helper: is this user a state franchisee that owns the franchisee row?
CREATE OR REPLACE FUNCTION public.state_franchise_owns_franchisee(_user_id uuid, _franchisee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.franchisees f
    JOIN public.territories t ON t.id = f.territory_id
    JOIN public.state_franchises sf ON sf.id = t.state_franchise_id
    WHERE f.id = _franchisee_id AND sf.user_id = _user_id
  )
$$;

-- 6. Read-only RLS for state franchisees on city-level data
CREATE POLICY "franchisees state read" ON public.franchisees FOR SELECT TO public
  USING (public.state_franchise_owns_franchisee(auth.uid(), id));

CREATE POLICY "leads state read" ON public.leads FOR SELECT TO public
  USING (territory_id IS NOT NULL AND public.state_franchise_owns_territory(auth.uid(), territory_id));

CREATE POLICY "lead_activities state read" ON public.lead_activities FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_activities.lead_id
      AND l.territory_id IS NOT NULL
      AND public.state_franchise_owns_territory(auth.uid(), l.territory_id)
  ));

CREATE POLICY "sales_orders state read" ON public.sales_orders FOR SELECT TO public
  USING (franchisee_id IS NOT NULL AND public.state_franchise_owns_franchisee(auth.uid(), franchisee_id));

CREATE POLICY "sale_payments state read" ON public.sale_payments FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.sales_orders so
    WHERE so.id = sale_payments.order_id
      AND so.franchisee_id IS NOT NULL
      AND public.state_franchise_owns_franchisee(auth.uid(), so.franchisee_id)
  ));

CREATE POLICY "revenue_entries state read" ON public.revenue_entries FOR SELECT TO public
  USING (franchisee_id IS NOT NULL AND public.state_franchise_owns_franchisee(auth.uid(), franchisee_id));

CREATE POLICY "expenses state read" ON public.expenses FOR SELECT TO public
  USING (franchisee_id IS NOT NULL AND public.state_franchise_owns_franchisee(auth.uid(), franchisee_id));

CREATE POLICY "stock_levels state read" ON public.stock_levels FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = stock_levels.warehouse_id
      AND w.franchisee_id IS NOT NULL
      AND public.state_franchise_owns_franchisee(auth.uid(), w.franchisee_id)
  ));

CREATE POLICY "warehouses state read" ON public.warehouses FOR SELECT TO public
  USING (franchisee_id IS NOT NULL AND public.state_franchise_owns_franchisee(auth.uid(), franchisee_id));

-- 7. Auto-link on auth signup
CREATE OR REPLACE FUNCTION public.auto_link_state_franchise_on_user_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.state_franchises
  SET user_id = NEW.id, updated_at = now()
  WHERE user_id IS NULL
    AND email IS NOT NULL
    AND lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_state_franchise ON auth.users;
CREATE TRIGGER trg_auto_link_state_franchise
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_link_state_franchise_on_user_signup();