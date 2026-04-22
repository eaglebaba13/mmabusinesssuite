-- Create social_integrations table (if missing) and ad_campaigns
CREATE TABLE IF NOT EXISTS public.social_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  display_name text,
  credentials jsonb DEFAULT '{}'::jsonb,
  franchisee_id uuid REFERENCES public.franchisees(id) ON DELETE CASCADE,
  territory_id uuid,
  active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add sync columns if table already existed
ALTER TABLE public.social_integrations
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_status text,
  ADD COLUMN IF NOT EXISTS last_sync_error text;

ALTER TABLE public.social_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "si admin all" ON public.social_integrations;
CREATE POLICY "si admin all" ON public.social_integrations
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'sales'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'sales'::app_role));

DROP POLICY IF EXISTS "si franchisee read" ON public.social_integrations;
CREATE POLICY "si franchisee read" ON public.social_integrations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.franchisees f
    WHERE f.user_id = auth.uid()
      AND (f.id = social_integrations.franchisee_id OR f.territory_id = social_integrations.territory_id)
  ));

-- ad_campaigns table
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  preview_url text,
  headline text,
  body text,
  cta_url text,
  territory_id uuid,
  franchisee_id uuid REFERENCES public.franchisees(id) ON DELETE SET NULL,
  spend_total numeric NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ad_campaigns_source_external_uq
  ON public.ad_campaigns (source, external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ad_campaigns_franchisee_idx ON public.ad_campaigns (franchisee_id);
CREATE INDEX IF NOT EXISTS ad_campaigns_territory_idx ON public.ad_campaigns (territory_id);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_campaigns admin all" ON public.ad_campaigns;
CREATE POLICY "ad_campaigns admin all" ON public.ad_campaigns
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'sales'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'sales'::app_role));

DROP POLICY IF EXISTS "ad_campaigns franchisee read" ON public.ad_campaigns;
CREATE POLICY "ad_campaigns franchisee read" ON public.ad_campaigns
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.franchisees f
    WHERE f.user_id = auth.uid()
      AND (f.id = ad_campaigns.franchisee_id OR (f.territory_id IS NOT NULL AND f.territory_id = ad_campaigns.territory_id))
  ));

-- updated_at trigger
DROP TRIGGER IF EXISTS ad_campaigns_set_updated_at ON public.ad_campaigns;
CREATE TRIGGER ad_campaigns_set_updated_at
  BEFORE UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS social_integrations_set_updated_at ON public.social_integrations;
CREATE TRIGGER social_integrations_set_updated_at
  BEFORE UPDATE ON public.social_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Schedule hourly cron to call sync edge function (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ad-leads-hourly') THEN
    PERFORM cron.unschedule('sync-ad-leads-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-ad-leads-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tdcyyaoeatwwgriokwdc.supabase.co/functions/v1/sync-ad-leads',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkY3l5YW9lYXR3d2dyaW9rd2RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDkzMDEsImV4cCI6MjA5MjQyNTMwMX0.bfvhRWSy6zZZ3kyZpyNF9mFqDz3HDuOCCdpJfFbuemY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);