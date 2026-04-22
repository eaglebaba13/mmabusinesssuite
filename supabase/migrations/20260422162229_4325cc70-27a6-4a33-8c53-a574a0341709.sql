
-- Lead routing rules: match incoming social leads and auto-assign owner / territory / franchisee
CREATE TABLE public.lead_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  -- match conditions (all non-null conditions must match; case-insensitive substring)
  match_source TEXT,           -- e.g. 'meta', 'google', 'zapier'
  match_campaign TEXT,         -- substring match on campaign field
  match_utm_source TEXT,
  match_utm_medium TEXT,
  match_utm_campaign TEXT,
  match_city TEXT,             -- substring
  match_state TEXT,            -- exact (case-insensitive)
  -- assignment actions
  assign_to_user UUID,         -- profiles.id (sales rep)
  assign_territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  assign_franchisee_id UUID REFERENCES public.franchisees(id) ON DELETE SET NULL,
  set_stage public.lead_stage,
  add_tag TEXT,                -- appended to lead notes
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_routing_rules_priority ON public.lead_routing_rules (enabled, priority);

ALTER TABLE public.lead_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routing rules admin all"
  ON public.lead_routing_rules
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'sales'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'sales'::app_role));

CREATE TRIGGER trg_lead_routing_rules_updated
  BEFORE UPDATE ON public.lead_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Track which rule (if any) matched a lead, and who it was assigned to via routing
ALTER TABLE public.social_lead_events
  ADD COLUMN IF NOT EXISTS matched_rule_id UUID REFERENCES public.lead_routing_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS assigned_territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_franchisee_id UUID REFERENCES public.franchisees(id) ON DELETE SET NULL;
