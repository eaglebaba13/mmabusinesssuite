CREATE POLICY "Admins manage franchisee-docs objects" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'franchisee-docs' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'franchisee-docs' AND public.is_admin(auth.uid()));

CREATE POLICY "Franchisees read own docs objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'franchisee-docs'
    AND EXISTS (
      SELECT 1 FROM public.franchisees f
      WHERE f.user_id = auth.uid()
        AND (storage.foldername(name))[1] = f.id::text
    )
  );

CREATE POLICY "Franchisees upload own docs objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'franchisee-docs'
    AND EXISTS (
      SELECT 1 FROM public.franchisees f
      WHERE f.user_id = auth.uid()
        AND (storage.foldername(name))[1] = f.id::text
    )
  );