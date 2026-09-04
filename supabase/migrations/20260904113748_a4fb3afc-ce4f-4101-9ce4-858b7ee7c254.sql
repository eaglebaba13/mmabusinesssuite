-- 1) Auto-generate franchisee code on onboarding
CREATE OR REPLACE FUNCTION public.gen_franchisee_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year int := EXTRACT(YEAR FROM now())::int;
  _seq int;
BEGIN
  IF NEW.franchisee_code IS NULL OR btrim(NEW.franchisee_code) = '' THEN
    INSERT INTO public.document_number_counters(prefix, year, last_seq)
    VALUES ('MMA-CF', _year, 1)
    ON CONFLICT (prefix, year) DO UPDATE SET last_seq = public.document_number_counters.last_seq + 1
    RETURNING last_seq INTO _seq;
    NEW.franchisee_code := 'MMA-CF-' || _year::text || '-' || lpad(_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_franchisees_gen_code ON public.franchisees;
CREATE TRIGGER trg_franchisees_gen_code
  BEFORE INSERT ON public.franchisees
  FOR EACH ROW EXECUTE FUNCTION public.gen_franchisee_code();

DO $$
DECLARE r record; _year int := EXTRACT(YEAR FROM now())::int; _seq int;
BEGIN
  FOR r IN SELECT id FROM public.franchisees WHERE franchisee_code IS NULL OR btrim(franchisee_code) = '' ORDER BY created_at LOOP
    INSERT INTO public.document_number_counters(prefix, year, last_seq)
    VALUES ('MMA-CF', _year, 1)
    ON CONFLICT (prefix, year) DO UPDATE SET last_seq = public.document_number_counters.last_seq + 1
    RETURNING last_seq INTO _seq;
    UPDATE public.franchisees SET franchisee_code = 'MMA-CF-' || _year::text || '-' || lpad(_seq::text, 4, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- 2) Security: nail emporium role must not read full franchisee records
DROP POLICY IF EXISTS "fr_emporium_read" ON public.franchisees;

-- 3) Security: hide ad-platform credentials from non-admins
DROP POLICY IF EXISTS "si sales read" ON public.social_integrations;
DROP POLICY IF EXISTS "si franchisee read" ON public.social_integrations;

CREATE OR REPLACE VIEW public.social_integrations_meta
WITH (security_invoker = off) AS
SELECT si.id, si.source, si.display_name, si.franchisee_id, si.territory_id,
       si.active, si.last_sync_at, si.last_sync_status, si.created_at, si.updated_at
FROM public.social_integrations si
WHERE public.is_admin(auth.uid())
   OR public.has_role(auth.uid(), 'sales')
   OR EXISTS (
        SELECT 1 FROM public.franchisees f
        WHERE f.user_id = auth.uid()
          AND (f.id = si.franchisee_id OR f.territory_id = si.territory_id)
      );

GRANT SELECT ON public.social_integrations_meta TO authenticated;