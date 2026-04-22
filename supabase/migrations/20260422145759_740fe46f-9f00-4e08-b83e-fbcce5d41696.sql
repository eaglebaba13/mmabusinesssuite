-- Webinar enums
CREATE TYPE public.webinar_status AS ENUM ('draft','scheduled','live','completed','cancelled');
CREATE TYPE public.webinar_platform AS ENUM ('zoom','google_meet','youtube','teams','other');

-- Webinars table
CREATE TABLE public.webinars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  host_name TEXT,
  cover_url TEXT,
  platform public.webinar_platform NOT NULL DEFAULT 'zoom',
  join_url TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  capacity INTEGER NOT NULL DEFAULT 500,
  price NUMERIC NOT NULL DEFAULT 0,
  status public.webinar_status NOT NULL DEFAULT 'draft',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webinars_scheduled ON public.webinars (scheduled_at DESC);
CREATE INDEX idx_webinars_status ON public.webinars (status);

-- Registrations
CREATE TABLE public.webinar_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  city TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attended BOOLEAN NOT NULL DEFAULT false,
  attended_at TIMESTAMPTZ,
  lead_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (webinar_id, email)
);

CREATE INDEX idx_wr_webinar ON public.webinar_registrations (webinar_id);
CREATE INDEX idx_wr_email ON public.webinar_registrations (email);
CREATE INDEX idx_wr_lead ON public.webinar_registrations (lead_id);

-- updated_at triggers
CREATE TRIGGER trg_webinars_updated_at BEFORE UPDATE ON public.webinars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_wr_updated_at BEFORE UPDATE ON public.webinar_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-convert registration to a Lead
CREATE OR REPLACE FUNCTION public.convert_registration_to_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_lead UUID;
  new_lead_id UUID;
BEGIN
  -- Try to find an existing lead by email or phone
  SELECT id INTO existing_lead
  FROM public.leads
  WHERE (NEW.email IS NOT NULL AND email = NEW.email)
     OR (NEW.phone IS NOT NULL AND phone = NEW.phone)
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_lead IS NULL THEN
    INSERT INTO public.leads (full_name, email, phone, city, source, stage, notes)
    VALUES (NEW.full_name, NEW.email, NEW.phone, NEW.city, 'webinar', 'new',
      'Auto-created from webinar registration')
    RETURNING id INTO new_lead_id;
    NEW.lead_id := new_lead_id;
  ELSE
    NEW.lead_id := existing_lead;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wr_to_lead BEFORE INSERT ON public.webinar_registrations
  FOR EACH ROW EXECUTE FUNCTION public.convert_registration_to_lead();

-- RLS
ALTER TABLE public.webinars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_registrations ENABLE ROW LEVEL SECURITY;

-- Webinars policies
CREATE POLICY "webinars admin all" ON public.webinars
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'webinar'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'webinar'));

CREATE POLICY "webinars public read published" ON public.webinars
  FOR SELECT USING (status IN ('scheduled','live','completed'));

CREATE POLICY "webinars auth read" ON public.webinars
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Registrations policies
CREATE POLICY "wr admin all" ON public.webinar_registrations
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'webinar'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'webinar'));

CREATE POLICY "wr public insert" ON public.webinar_registrations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.webinars w
      WHERE w.id = webinar_id AND w.status <> 'cancelled'
    )
  );

CREATE POLICY "wr sales read" ON public.webinar_registrations
  FOR SELECT USING (has_role(auth.uid(), 'sales'));
