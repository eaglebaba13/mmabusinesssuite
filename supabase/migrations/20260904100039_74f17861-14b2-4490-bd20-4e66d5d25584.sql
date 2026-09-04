CREATE POLICY "official docs staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'official-documents' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'hr')));
CREATE POLICY "official docs staff insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'official-documents' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'hr')));
CREATE POLICY "official docs staff update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'official-documents' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'hr')));
CREATE POLICY "official docs staff delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'official-documents' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'hr')));