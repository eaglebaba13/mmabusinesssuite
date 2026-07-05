
-- Signed-in users can read product media
CREATE POLICY "product_media_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'product-media');

-- Admins can upload
CREATE POLICY "product_media_insert_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-media' AND public.is_admin(auth.uid()));

-- Admins can update
CREATE POLICY "product_media_update_admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-media' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'product-media' AND public.is_admin(auth.uid()));

-- Admins can delete
CREATE POLICY "product_media_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-media' AND public.is_admin(auth.uid()));
