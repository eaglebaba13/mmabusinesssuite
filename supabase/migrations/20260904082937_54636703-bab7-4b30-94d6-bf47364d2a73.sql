CREATE POLICY "Finance staff read roi claim files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'roi-claims' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'founder')
    OR public.has_role(auth.uid(), 'accounts')
  )
);

CREATE POLICY "Finance staff upload roi claim files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'roi-claims' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'founder')
    OR public.has_role(auth.uid(), 'accounts')
  )
);

CREATE POLICY "Finance staff update roi claim files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'roi-claims' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'founder')
    OR public.has_role(auth.uid(), 'accounts')
  )
);

CREATE POLICY "Finance staff delete roi claim files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'roi-claims' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'founder')
    OR public.has_role(auth.uid(), 'accounts')
  )
);

CREATE POLICY "Franchisee reads own roi claim files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'roi-claims'
  AND EXISTS (
    SELECT 1 FROM public.franchisees f
    WHERE f.id::text = (storage.foldername(name))[1]
      AND (f.user_id = auth.uid() OR f.manager_user_id = auth.uid())
  )
);