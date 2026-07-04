
DROP POLICY IF EXISTS "cert public verify" ON public.certificates;

CREATE OR REPLACE FUNCTION public.verify_certificate(_code text)
RETURNS TABLE(
  certificate_code text,
  grade text,
  issued_on date,
  student_full_name text,
  batch_code text,
  course_title text,
  duration_weeks integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.certificate_code, c.grade, c.issued_on,
         s.full_name, b.batch_code, co.title, co.duration_weeks
  FROM public.certificates c
  JOIN public.enrollments e ON e.id = c.enrollment_id
  JOIN public.students s ON s.id = e.student_id
  JOIN public.batches b ON b.id = e.batch_id
  JOIN public.courses co ON co.id = b.course_id
  WHERE c.certificate_code = _code
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;

DROP POLICY IF EXISTS "companies_read_auth" ON public.companies;
CREATE POLICY "companies_read_roles" ON public.companies
FOR SELECT TO authenticated
USING (
  active = true AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'accounts')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'inventory')
    OR public.has_role(auth.uid(), 'nail_emporium')
    OR public.has_role(auth.uid(), 'package_sales')
  )
);

DROP POLICY IF EXISTS "ec read auth" ON public.expense_categories;
CREATE POLICY "ec read roles" ON public.expense_categories
FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accounts'));

DROP POLICY IF EXISTS "activities insert" ON public.lead_activities;
CREATE POLICY "activities insert scoped" ON public.lead_activities
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_activities.lead_id
      AND (
        l.assigned_to = auth.uid()
        OR (l.territory_id IS NOT NULL AND public.state_franchise_owns_territory(auth.uid(), l.territory_id))
        OR EXISTS (
          SELECT 1 FROM public.franchisees f
          WHERE f.territory_id = l.territory_id AND f.user_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "roi_settings read all authed" ON public.org_roi_settings;
CREATE POLICY "roi_settings read roles" ON public.org_roi_settings
FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'accounts'));

DROP POLICY IF EXISTS "Read revenue model items" ON public.revenue_model_items;
CREATE POLICY "Read revenue model items scoped" ON public.revenue_model_items
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'accounts')
  OR public.has_role(auth.uid(), 'sales')
);

DROP POLICY IF EXISTS "trainers read all auth" ON public.trainers;
CREATE POLICY "trainers read scoped" ON public.trainers
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'academy_admin')
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "webinars auth read" ON public.webinars;
CREATE POLICY "webinars auth read scoped" ON public.webinars
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'webinar')
  OR public.has_role(auth.uid(), 'sales')
);
