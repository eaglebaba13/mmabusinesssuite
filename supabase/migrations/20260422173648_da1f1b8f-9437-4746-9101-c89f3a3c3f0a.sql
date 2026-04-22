CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.revenue_model_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order INT NOT NULL,
  category TEXT NOT NULL,
  particulars TEXT NOT NULL,
  description TEXT,
  mrp NUMERIC(12,2) NOT NULL DEFAULT 0,
  offer_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  offer_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  target_segment TEXT,
  default_target INT NOT NULL DEFAULT 0,
  franchisee_roi_pct NUMERIC(6,2) NOT NULL DEFAULT 3,
  state_partner_pct NUMERIC(6,2) NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.revenue_model_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read revenue model items" ON public.revenue_model_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage revenue model items" ON public.revenue_model_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'accounts'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'accounts'));

CREATE TABLE public.franchisee_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchisee_id UUID REFERENCES public.franchisees(id) ON DELETE CASCADE,
  city TEXT NOT NULL DEFAULT '',
  model_item_id UUID NOT NULL REFERENCES public.revenue_model_items(id) ON DELETE CASCADE,
  target_numbers INT NOT NULL DEFAULT 0,
  period_month DATE NOT NULL DEFAULT '1900-01-01',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (franchisee_id, city, model_item_id, period_month)
);
CREATE INDEX idx_franchisee_targets_franchisee ON public.franchisee_targets(franchisee_id);
CREATE INDEX idx_franchisee_targets_city ON public.franchisee_targets(city);
ALTER TABLE public.franchisee_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage all targets" ON public.franchisee_targets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'sales'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'sales'));
CREATE POLICY "Franchisees view own targets" ON public.franchisee_targets FOR SELECT TO authenticated
  USING (franchisee_id IN (SELECT id FROM public.franchisees WHERE user_id = auth.uid()));

CREATE TRIGGER trg_rmi_upd BEFORE UPDATE ON public.revenue_model_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ft_upd BEFORE UPDATE ON public.franchisee_targets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.revenue_model_items
  (sort_order, category, particulars, description, mrp, offer_value, offer_cost, target_segment, default_target, franchisee_roi_pct, state_partner_pct)
VALUES
  (1, 'Course', 'Education Kit Nail with Online Education Recorded Also', NULL, 30000, 11000, 4500, 'students', 100, 3, 10),
  (2, 'MMA Program', 'Guru Class', 'Student chooses any 3 artist class valid for 1 year; whenever class running by the artists', 999, 999, 499.50, 'students', 500, 3, 10),
  (3, 'MMA Program', 'Big Coach', 'Single Artist Class valid for 1 year; whenever class running by the artist', 699, 699, 349.50, 'students', 500, 3, 10),
  (4, 'MMA Program', 'Nail Coach', 'Regular weekly classes running by Nail Emporium', 199, 199, 99.50, 'students', 500, 3, 10),
  (5, 'MMA Program', 'Partner Academy', 'Software, Landing Page, LLM (White Label)', 50000, 25000, 8000, 'academy', 100, 3, 10),
  (6, 'MOS', 'Dark Store - (Only Website)', 'White Label Website of Mall of Salon', 200000, 80000, 40000, NULL, 20, 3, 0),
  (7, 'MOS', 'Cosmetic Shop (Website+Application) SaaS', 'Software Online', 75000, 20000, 5000, 'shop', 200, 3, 10),
  (8, 'Nail Emporium (Package)', 'Get "Nail Bar" at your Salon "Press on Nail" 50 Box - With Online Training', NULL, 40000, 15000, 5500, 'salons', 150, 10, 0),
  (9, 'Nail Emporium (Package)', 'Emigel Kit Rs 27,500 with Free Education Live and Record', 'Nail Emporium Kit', 60000, 27500, 15500, 'students', 100, 3, 10),
  (10, 'Nail Emporium (Package)', 'Lick / Emigel - NailSalon Kit - Rs 250000', 'Nail Emporium Kit', 250000, 150000, 50000, 'students', 50, 3, 10);