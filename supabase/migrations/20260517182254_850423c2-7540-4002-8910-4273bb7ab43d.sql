-- Storage bucket for invoice source documents (proformas, supporting bills)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-sources', 'invoice-sources', true)
ON CONFLICT (id) DO NOTHING;

-- Read: any authenticated user (URL is only embedded on invoices they can see)
CREATE POLICY "invoice_sources_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'invoice-sources');

-- Write: admin/accounts/nail_emporium only
CREATE POLICY "invoice_sources_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-sources'
    AND (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts') OR has_role(auth.uid(),'nail_emporium'))
  );

CREATE POLICY "invoice_sources_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'invoice-sources'
    AND (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts') OR has_role(auth.uid(),'nail_emporium'))
  );

CREATE POLICY "invoice_sources_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoice-sources'
    AND (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts') OR has_role(auth.uid(),'nail_emporium'))
  );
