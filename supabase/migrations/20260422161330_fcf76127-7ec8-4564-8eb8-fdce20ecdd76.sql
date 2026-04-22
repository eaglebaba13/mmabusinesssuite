
-- 1) Add social URLs + lead webhook secret to org_settings
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS lead_webhook_secret TEXT;

-- 2) Audit trail for inbound social/ad lead webhook deliveries
CREATE TABLE IF NOT EXISTS public.social_lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                -- 'meta' | 'google' | 'manual_test' | etc.
  campaign TEXT,
  payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received', -- received | dedup | created | error | rejected
  error_message TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_lead_events_created_at
  ON public.social_lead_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_lead_events_source
  ON public.social_lead_events (source);

ALTER TABLE public.social_lead_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_social_lead_events" ON public.social_lead_events;
CREATE POLICY "admin_select_social_lead_events" ON public.social_lead_events
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'accounts')
  );

-- (no insert/update/delete policies → only service role via webhook can write)
