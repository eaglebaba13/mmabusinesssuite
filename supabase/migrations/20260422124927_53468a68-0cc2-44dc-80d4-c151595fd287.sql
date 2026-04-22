-- Expense categories
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  color text DEFAULT '#c9a84c',
  monthly_budget numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Expenses
CREATE TYPE public.expense_status AS ENUM ('pending','paid','cancelled');
CREATE TYPE public.payment_method AS ENUM ('cash','bank_transfer','upi','card','cheque','other');

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  franchisee_id uuid REFERENCES public.franchisees(id) ON DELETE SET NULL,
  vendor text,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'bank_transfer',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  receipt_url text,
  reference text,
  status public.expense_status NOT NULL DEFAULT 'paid',
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX idx_expenses_category ON public.expenses(category_id);
CREATE INDEX idx_expenses_franchisee ON public.expenses(franchisee_id);

-- Revenue entries (manual income beyond Academy/Inventory auto-aggregation)
CREATE TYPE public.revenue_source AS ENUM ('academy','inventory','franchise_fee','consulting','event','other');

CREATE TABLE public.revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.revenue_source NOT NULL DEFAULT 'other',
  source_label text,
  franchisee_id uuid REFERENCES public.franchisees(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  received_on date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_revenue_date ON public.revenue_entries(received_on DESC);
CREATE INDEX idx_revenue_franchisee ON public.revenue_entries(franchisee_id);

-- Triggers for updated_at
CREATE TRIGGER set_updated_at_expense_categories BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_expenses BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_revenue_entries BEFORE UPDATE ON public.revenue_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_entries ENABLE ROW LEVEL SECURITY;

-- expense_categories: read for all auth, write for admins/accounts
CREATE POLICY "ec read auth" ON public.expense_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ec admin all" ON public.expense_categories FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'));

-- expenses: admins/accounts manage all; franchisees read own
CREATE POLICY "exp admin all" ON public.expenses FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'));

CREATE POLICY "exp franchisee read" ON public.expenses FOR SELECT
  USING (EXISTS (SELECT 1 FROM franchisees f WHERE f.id = expenses.franchisee_id AND f.user_id = auth.uid()));

-- revenue_entries: admins/accounts manage all; franchisees read own
CREATE POLICY "rev admin all" ON public.revenue_entries FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'));

CREATE POLICY "rev franchisee read" ON public.revenue_entries FOR SELECT
  USING (EXISTS (SELECT 1 FROM franchisees f WHERE f.id = revenue_entries.franchisee_id AND f.user_id = auth.uid()));

-- Seed default expense categories
INSERT INTO public.expense_categories (name, slug, color, monthly_budget, description) VALUES
  ('Salaries', 'salaries', '#c9a84c', 500000, 'Staff & trainer salaries'),
  ('Rent', 'rent', '#9b72cf', 150000, 'Office, warehouse & academy rent'),
  ('Marketing', 'marketing', '#e85d3a', 200000, 'Ads, content, events'),
  ('Utilities', 'utilities', '#5cbdb9', 40000, 'Electricity, internet, water'),
  ('Software & SaaS', 'software', '#3b82f6', 60000, 'Tools and subscriptions'),
  ('Travel', 'travel', '#f7931e', 50000, 'Trainer & sales travel'),
  ('Inventory & COGS', 'inventory', '#a0c49d', 800000, 'Stock purchases'),
  ('Professional Fees', 'professional', '#c9b99a', 80000, 'Legal, CA, consulting'),
  ('Other', 'other', '#718096', 30000, 'Miscellaneous');

-- Seed sample revenue entries (last 6 months)
INSERT INTO public.revenue_entries (source, source_label, amount, received_on, reference) VALUES
  ('franchise_fee','New franchise — Bengaluru', 1500000, CURRENT_DATE - 12, 'FRN-2025-09'),
  ('franchise_fee','New franchise — Hyderabad', 1500000, CURRENT_DATE - 45, 'FRN-2025-08'),
  ('consulting','Brand consulting — Apex Salons', 250000, CURRENT_DATE - 22, 'CON-0042'),
  ('event','Mumbai Beauty Expo booth', 180000, CURRENT_DATE - 60, 'EVT-MBE-25'),
  ('other','Affiliate commission Q3', 85000, CURRENT_DATE - 30, 'AFF-Q3'),
  ('consulting','Digital strategy retainer', 120000, CURRENT_DATE - 7, 'CON-0051');

-- Seed sample expenses
INSERT INTO public.expenses (category_id, vendor, description, amount, payment_method, expense_date, status)
SELECT ec.id, v.vendor, v.descr, v.amount, v.method::payment_method, v.dt, 'paid'::expense_status
FROM (VALUES
  ('salaries','Payroll Sept', 'Monthly salaries Sept', 850000, 'bank_transfer', CURRENT_DATE - 20),
  ('salaries','Payroll Oct', 'Monthly salaries Oct', 920000, 'bank_transfer', CURRENT_DATE - 5),
  ('rent','Embassy Crest', 'Bangalore HQ rent — Oct', 145000, 'bank_transfer', CURRENT_DATE - 8),
  ('rent','Sunstone Properties', 'Mumbai academy rent — Oct', 110000, 'bank_transfer', CURRENT_DATE - 9),
  ('marketing','Meta Ads', 'Lead gen campaign Oct', 185000, 'card', CURRENT_DATE - 3),
  ('marketing','Google Ads', 'Search campaign Oct', 95000, 'card', CURRENT_DATE - 4),
  ('marketing','InfluencerCo', 'Reels package — 5 creators', 220000, 'bank_transfer', CURRENT_DATE - 18),
  ('utilities','BESCOM', 'Electricity — HQ', 28000, 'upi', CURRENT_DATE - 11),
  ('utilities','ACT Fibernet', 'Internet — HQ + Academy', 12500, 'upi', CURRENT_DATE - 14),
  ('software','Lovable Cloud', 'Platform subscription', 15000, 'card', CURRENT_DATE - 1),
  ('software','HubSpot', 'CRM annual', 42000, 'card', CURRENT_DATE - 25),
  ('travel','IndiGo', 'Trainer travel — Pune batch', 18500, 'card', CURRENT_DATE - 16),
  ('inventory','Beauty Distributors LLP', 'Bulk product order', 425000, 'bank_transfer', CURRENT_DATE - 22),
  ('professional','Khaitan & Co', 'Franchise agreement legal', 65000, 'bank_transfer', CURRENT_DATE - 28),
  ('professional','Patel & Associates', 'CA quarterly retainer', 35000, 'bank_transfer', CURRENT_DATE - 35),
  ('other','Office supplies', 'Stationery & pantry', 14500, 'cash', CURRENT_DATE - 6)
) v(slug, vendor, descr, amount, method, dt)
JOIN public.expense_categories ec ON ec.slug = v.slug;

-- Seed ROI payouts (use existing franchisees if any)
INSERT INTO public.roi_payouts (franchisee_id, payout_month, base_roi, academy_incentive, dark_store_incentive, emporium_incentive, total_amount, status)
SELECT f.id,
  date_trunc('month', CURRENT_DATE - (n || ' month')::interval)::date,
  45000 + (random()*15000)::int,
  8000 + (random()*5000)::int,
  6000 + (random()*4000)::int,
  4000 + (random()*3000)::int,
  0,
  CASE WHEN n = 0 THEN 'pending'::payout_status ELSE 'paid'::payout_status END
FROM public.franchisees f
CROSS JOIN generate_series(0, 2) n
WHERE f.status = 'active'
ON CONFLICT DO NOTHING;

-- Recompute totals
UPDATE public.roi_payouts
SET total_amount = base_roi + academy_incentive + dark_store_incentive + emporium_incentive
WHERE total_amount = 0;