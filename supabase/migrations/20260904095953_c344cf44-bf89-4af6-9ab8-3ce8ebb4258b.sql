-- Central official document registry + numbering
CREATE TABLE IF NOT EXISTS public.document_number_counters (
  prefix text NOT NULL,
  year int NOT NULL,
  last_seq int NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year)
);
GRANT SELECT ON public.document_number_counters TO authenticated;
GRANT ALL ON public.document_number_counters TO service_role;
ALTER TABLE public.document_number_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "counters readable by staff" ON public.document_number_counters
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'hr'));

CREATE TABLE IF NOT EXISTS public.official_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL,
  doc_number text NOT NULL UNIQUE,
  title text NOT NULL,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'generated',
  franchisee_id uuid REFERENCES public.franchisees(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  agreement_id uuid REFERENCES public.franchise_agreements(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  payout_id uuid REFERENCES public.roi_payouts(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  source_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_path text,
  docx_path text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS official_documents_type_source_uidx
  ON public.official_documents(doc_type, source_key) WHERE source_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_documents TO authenticated;
GRANT ALL ON public.official_documents TO service_role;
ALTER TABLE public.official_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage official documents" ON public.official_documents
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "franchisee reads own documents" ON public.official_documents
  FOR SELECT TO authenticated
  USING (franchisee_id IS NOT NULL AND franchisee_id IN (SELECT id FROM public.franchisees WHERE user_id = auth.uid()));

CREATE TRIGGER official_documents_updated_at BEFORE UPDATE ON public.official_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.official_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.official_documents(id) ON DELETE CASCADE,
  version int NOT NULL,
  action text NOT NULL,
  reason text,
  payload jsonb,
  pdf_path text,
  docx_path text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.official_document_versions TO authenticated;
GRANT ALL ON public.official_document_versions TO service_role;
ALTER TABLE public.official_document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage document versions" ON public.official_document_versions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'hr'));

CREATE OR REPLACE FUNCTION public.next_document_number(_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year int := EXTRACT(YEAR FROM now())::int;
  _seq int;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'hr')) THEN
    RAISE EXCEPTION 'Not authorized to generate official documents';
  END IF;
  INSERT INTO public.document_number_counters(prefix, year, last_seq)
  VALUES (_prefix, _year, 1)
  ON CONFLICT (prefix, year) DO UPDATE SET last_seq = public.document_number_counters.last_seq + 1
  RETURNING last_seq INTO _seq;
  RETURN _prefix || '-' || _year::text || '-' || lpad(_seq::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_document_number(text) FROM public;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;