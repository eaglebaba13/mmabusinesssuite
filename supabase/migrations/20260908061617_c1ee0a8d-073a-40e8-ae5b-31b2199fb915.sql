-- 1. Security definer view -> invoker, with column-level protection of credentials
ALTER VIEW public.social_integrations_meta SET (security_invoker = true);

REVOKE SELECT ON public.social_integrations FROM authenticated;
GRANT SELECT (id, source, display_name, franchisee_id, territory_id, active, last_sync_at, last_sync_status, created_at, updated_at)
  ON public.social_integrations TO authenticated;
GRANT ALL ON public.social_integrations TO service_role;

CREATE POLICY "si status read" ON public.social_integrations
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'sales'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.franchisees f
    WHERE f.user_id = auth.uid()
      AND (f.id = social_integrations.franchisee_id OR f.territory_id = social_integrations.territory_id)
  )
);

-- 2. Sales users only see their own leads
DROP POLICY IF EXISTS "leads sales select" ON public.leads;
CREATE POLICY "leads sales select" ON public.leads
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'sales'::app_role)
  AND assigned_to = auth.uid()
);

-- 3. Franchisees only see products stocked in their own warehouse
DROP POLICY IF EXISTS "products franchisee read" ON public.products;
CREATE POLICY "products franchisee read" ON public.products
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.stock_levels sl
    JOIN public.warehouses w ON w.id = sl.warehouse_id
    JOIN public.franchisees f ON f.id = w.franchisee_id
    WHERE sl.product_id = products.id
      AND f.user_id = auth.uid()
  )
);

-- 4. Public webinar registration: only for live/scheduled, not-yet-started webinars
DROP POLICY IF EXISTS "wr public insert" ON public.webinar_registrations;
CREATE POLICY "wr public insert" ON public.webinar_registrations
FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.webinars w
    WHERE w.id = webinar_registrations.webinar_id
      AND w.status IN ('scheduled', 'live')
      AND w.scheduled_at > now() - interval '2 hours'
  )
);

-- Basic server-side validation of submitted registration data
CREATE OR REPLACE FUNCTION public.validate_webinar_registration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.full_name := btrim(NEW.full_name);
  IF NEW.full_name IS NULL OR length(NEW.full_name) < 2 OR length(NEW.full_name) > 120 THEN
    RAISE EXCEPTION 'Please enter a valid full name';
  END IF;

  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
    IF NEW.email = '' THEN
      NEW.email := NULL;
    ELSIF NEW.email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' OR length(NEW.email) > 200 THEN
      RAISE EXCEPTION 'Please enter a valid email address';
    END IF;
  END IF;

  IF NEW.phone IS NOT NULL THEN
    NEW.phone := btrim(NEW.phone);
    IF NEW.phone = '' THEN
      NEW.phone := NULL;
    ELSIF length(NEW.phone) < 7 OR length(NEW.phone) > 20 OR NEW.phone !~ '^[0-9+()\-\s]+$' THEN
      RAISE EXCEPTION 'Please enter a valid phone number';
    END IF;
  END IF;

  IF NEW.email IS NULL AND NEW.phone IS NULL THEN
    RAISE EXCEPTION 'Please provide an email address or phone number';
  END IF;

  IF NEW.city IS NOT NULL AND length(NEW.city) > 120 THEN
    RAISE EXCEPTION 'City name is too long';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_webinar_registration ON public.webinar_registrations;
CREATE TRIGGER trg_validate_webinar_registration
BEFORE INSERT OR UPDATE ON public.webinar_registrations
FOR EACH ROW EXECUTE FUNCTION public.validate_webinar_registration();