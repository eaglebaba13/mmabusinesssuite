-- 1. Backfill franchisees.user_id by matching email to auth.users
UPDATE public.franchisees f
SET user_id = u.id
FROM auth.users u
WHERE f.user_id IS NULL
  AND f.email IS NOT NULL
  AND lower(f.email) = lower(u.email);

-- 2. Auto-link trigger: when a new auth user signs up, link any matching franchisee row
CREATE OR REPLACE FUNCTION public.auto_link_franchisee_on_user_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.franchisees
  SET user_id = NEW.id, updated_at = now()
  WHERE user_id IS NULL
    AND email IS NOT NULL
    AND lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_link_franchisee_trigger ON auth.users;
CREATE TRIGGER auto_link_franchisee_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_franchisee_on_user_signup();

-- 3. RLS additions for franchisee-scoped reads

-- Leads: franchisee can read leads in their territory
DROP POLICY IF EXISTS "leads franchisee territory read" ON public.leads;
CREATE POLICY "leads franchisee territory read"
ON public.leads FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.franchisees f
    WHERE f.user_id = auth.uid()
      AND f.territory_id IS NOT NULL
      AND f.territory_id = public.leads.territory_id
  )
);

-- Lead activities: franchisee can read activities for leads in their territory
DROP POLICY IF EXISTS "lead_activities franchisee read" ON public.lead_activities;
CREATE POLICY "lead_activities franchisee read"
ON public.lead_activities FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.franchisees f ON f.territory_id = l.territory_id
    WHERE l.id = public.lead_activities.lead_id
      AND f.user_id = auth.uid()
  )
);

-- Social lead events: franchisee can read events whose lead falls in their territory
DROP POLICY IF EXISTS "social_lead_events franchisee read" ON public.social_lead_events;
CREATE POLICY "social_lead_events franchisee read"
ON public.social_lead_events FOR SELECT
USING (
  assigned_franchisee_id IN (
    SELECT id FROM public.franchisees WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.franchisees f ON f.territory_id = l.territory_id
    WHERE l.id = public.social_lead_events.lead_id
      AND f.user_id = auth.uid()
  )
);

-- Stock levels: franchisee can read stock at their assigned warehouse
DROP POLICY IF EXISTS "stock_levels franchisee read" ON public.stock_levels;
CREATE POLICY "stock_levels franchisee read"
ON public.stock_levels FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.franchisees f
    WHERE f.user_id = auth.uid()
      AND f.warehouse_id = public.stock_levels.warehouse_id
  )
);
