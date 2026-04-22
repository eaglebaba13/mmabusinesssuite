-- 1. Add webhook + reminder fields to webinars
ALTER TABLE public.webinars
  ADD COLUMN IF NOT EXISTS webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMPTZ;

-- 2. Add reminder tracking on registrations
ALTER TABLE public.webinar_registrations
  ADD COLUMN IF NOT EXISTS reminded_24h_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminded_1h_at TIMESTAMPTZ;

-- 3. Capacity guard: prevent inserts past capacity (excluding cancelled webinar handled by RLS)
CREATE OR REPLACE FUNCTION public.enforce_webinar_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap INTEGER;
  current_count INTEGER;
BEGIN
  SELECT capacity INTO cap FROM public.webinars WHERE id = NEW.webinar_id;
  SELECT COUNT(*) INTO current_count FROM public.webinar_registrations WHERE webinar_id = NEW.webinar_id;
  IF current_count >= cap THEN
    RAISE EXCEPTION 'Webinar is at full capacity (% seats)', cap USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_capacity ON public.webinar_registrations;
CREATE TRIGGER trg_enforce_capacity
  BEFORE INSERT ON public.webinar_registrations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_webinar_capacity();

-- 4. Public RPC to count registrations (so the public page can show seats remaining)
CREATE OR REPLACE FUNCTION public.webinar_seats_taken(_webinar_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.webinar_registrations WHERE webinar_id = _webinar_id;
$$;

GRANT EXECUTE ON FUNCTION public.webinar_seats_taken(UUID) TO anon, authenticated;

-- 5. Schedule reminder dispatch (every 15 min) via pg_cron + pg_net
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if exists, then re-schedule
DO $$
BEGIN
  PERFORM cron.unschedule('webinar-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'webinar-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mmabusinesssuite.lovable.app/api/public/webinar-reminders',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);