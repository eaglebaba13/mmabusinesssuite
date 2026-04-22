
-- =============== ENUMS ===============
CREATE TYPE public.app_role AS ENUM (
  'super_admin','founder','franchisee','sales','accounts','inventory',
  'academy_admin','webinar','hr','white_label','trainer','support','package_sales'
);

CREATE TYPE public.lead_stage AS ENUM (
  'new','interested','followup','hot','payment_pending','closed','lost'
);

CREATE TYPE public.lead_source AS ENUM (
  'meta','google','manual','referral','webinar','website'
);

CREATE TYPE public.payout_status AS ENUM ('pending','paid','overdue');
CREATE TYPE public.ticket_status AS ENUM ('open','in_progress','resolved','closed');
CREATE TYPE public.ticket_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.franchisee_status AS ENUM ('active','onboarding','suspended','closed');

-- =============== PROFILES ===============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============== USER ROLES ===============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- helper: any of two privileged roles
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','founder')
  )
$$;

-- =============== TERRITORIES ===============
CREATE TABLE public.territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;

-- =============== FRANCHISEES ===============
CREATE TABLE public.franchisees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  territory_id UUID REFERENCES public.territories(id),
  investment_amount NUMERIC(14,2) NOT NULL DEFAULT 500000,
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.franchisee_status NOT NULL DEFAULT 'active',
  agreement_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.franchisees ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_franchisees_user ON public.franchisees(user_id);

-- =============== LEADS ===============
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  city TEXT,
  source public.lead_source NOT NULL DEFAULT 'manual',
  stage public.lead_stage NOT NULL DEFAULT 'new',
  score INTEGER DEFAULT 0,
  budget NUMERIC(14,2),
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  territory_id UUID REFERENCES public.territories(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_leads_stage ON public.leads(stage);
CREATE INDEX idx_leads_assigned ON public.leads(assigned_to);

-- =============== LEAD ACTIVITIES ===============
CREATE TABLE public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  content TEXT,
  followup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_lead_activities_lead ON public.lead_activities(lead_id);

-- =============== ROI PAYOUTS ===============
CREATE TABLE public.roi_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchisee_id UUID NOT NULL REFERENCES public.franchisees(id) ON DELETE CASCADE,
  payout_month DATE NOT NULL,
  base_roi NUMERIC(14,2) NOT NULL DEFAULT 0,
  emporium_incentive NUMERIC(14,2) NOT NULL DEFAULT 0,
  academy_incentive NUMERIC(14,2) NOT NULL DEFAULT 0,
  dark_store_incentive NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status public.payout_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.roi_payouts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_roi_franchisee ON public.roi_payouts(franchisee_id);

-- =============== TICKETS ===============
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- =============== NOTIFICATIONS ===============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =============== AUDIT LOGS ===============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============== ORG SETTINGS ===============
CREATE TABLE public.org_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  org_name TEXT NOT NULL DEFAULT 'MMA Business Suite',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#c9a84c',
  contact_email TEXT,
  contact_phone TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.org_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- =============== TRIGGER: auto profile + default role ===============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  -- First user becomes super_admin, others get 'sales' default
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'sales')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============== UPDATED_AT TRIGGER ===============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_franchisees_updated BEFORE UPDATE ON public.franchisees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============== RLS POLICIES ===============

-- profiles: self read/update; admins read all
CREATE POLICY "profiles self select" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles admin update" ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid()));

-- user_roles: self read; admin manage
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "roles admin insert" ON public.user_roles FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "roles admin update" ON public.user_roles FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "roles admin delete" ON public.user_roles FOR DELETE USING (public.is_admin(auth.uid()));

-- territories: any authed read; admin write
CREATE POLICY "territories read" ON public.territories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "territories admin insert" ON public.territories FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "territories admin update" ON public.territories FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "territories admin delete" ON public.territories FOR DELETE USING (public.is_admin(auth.uid()));

-- franchisees: admin all; franchisee own
CREATE POLICY "franchisees admin select" ON public.franchisees FOR SELECT USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts'));
CREATE POLICY "franchisees self select" ON public.franchisees FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "franchisees admin insert" ON public.franchisees FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "franchisees admin update" ON public.franchisees FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "franchisees admin delete" ON public.franchisees FOR DELETE USING (public.is_admin(auth.uid()));

-- leads: admin all, sales sees assigned + unassigned
CREATE POLICY "leads admin select" ON public.leads FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "leads sales select" ON public.leads FOR SELECT USING (public.has_role(auth.uid(),'sales') AND (assigned_to = auth.uid() OR assigned_to IS NULL));
CREATE POLICY "leads insert" ON public.leads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "leads update" ON public.leads FOR UPDATE USING (public.is_admin(auth.uid()) OR assigned_to = auth.uid());
CREATE POLICY "leads delete" ON public.leads FOR DELETE USING (public.is_admin(auth.uid()));

-- lead_activities
CREATE POLICY "activities select" ON public.lead_activities FOR SELECT USING (
  public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.assigned_to = auth.uid()))
);
CREATE POLICY "activities insert" ON public.lead_activities FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- roi_payouts: admin all; franchisee own; accounts manage
CREATE POLICY "roi admin select" ON public.roi_payouts FOR SELECT USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts'));
CREATE POLICY "roi self select" ON public.roi_payouts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.franchisees f WHERE f.id = franchisee_id AND f.user_id = auth.uid())
);
CREATE POLICY "roi admin insert" ON public.roi_payouts FOR INSERT WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts'));
CREATE POLICY "roi admin update" ON public.roi_payouts FOR UPDATE USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts'));

-- tickets
CREATE POLICY "tickets select own" ON public.tickets FOR SELECT USING (created_by = auth.uid() OR assigned_to = auth.uid() OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'support'));
CREATE POLICY "tickets insert" ON public.tickets FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "tickets update" ON public.tickets FOR UPDATE USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'support') OR assigned_to = auth.uid());

-- notifications: own only
CREATE POLICY "notif select" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notif insert" ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- audit_logs: admin read
CREATE POLICY "audit admin select" ON public.audit_logs FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "audit insert" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- org_settings: any authed read; admin update
CREATE POLICY "settings read" ON public.org_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "settings update" ON public.org_settings FOR UPDATE USING (public.is_admin(auth.uid()));
