
CREATE POLICY "Authenticated can read brand logos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'brand-logos');

CREATE POLICY "Authenticated can upload brand logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'brand-logos');

CREATE POLICY "Authenticated can update brand logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'brand-logos');

CREATE POLICY "Authenticated can delete brand logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'brand-logos');
