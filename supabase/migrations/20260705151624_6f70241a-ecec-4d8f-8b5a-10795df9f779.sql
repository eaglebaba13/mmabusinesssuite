-- 1. ROI scenarios
CREATE TABLE public.franchise_roi_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.franchise_products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_roi_scenarios TO authenticated;
GRANT ALL ON public.franchise_roi_scenarios TO service_role;
ALTER TABLE public.franchise_roi_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ROI scenarios" ON public.franchise_roi_scenarios
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all ROI scenarios" ON public.franchise_roi_scenarios
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX idx_roi_scenarios_user ON public.franchise_roi_scenarios(user_id);
CREATE INDEX idx_roi_scenarios_product ON public.franchise_roi_scenarios(product_id);
CREATE TRIGGER trg_roi_scenarios_updated_at BEFORE UPDATE ON public.franchise_roi_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Agreements
CREATE TYPE public.franchise_agreement_status AS ENUM ('draft','sent','signed','expired','cancelled');
CREATE TABLE public.franchise_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.franchise_products(id) ON DELETE RESTRICT,
  franchisee_id UUID NOT NULL REFERENCES public.franchisees(id) ON DELETE CASCADE,
  version TEXT NOT NULL DEFAULT 'v1',
  status public.franchise_agreement_status NOT NULL DEFAULT 'draft',
  template_snapshot TEXT,
  merged_html TEXT,
  signed_pdf_url TEXT,
  storage_path TEXT,
  valid_from DATE,
  valid_till DATE,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_agreements TO authenticated;
GRANT ALL ON public.franchise_agreements TO service_role;
ALTER TABLE public.franchise_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage agreements" ON public.franchise_agreements
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Franchisees read own agreements" ON public.franchise_agreements
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.franchisees f WHERE f.id = franchise_agreements.franchisee_id AND f.user_id = auth.uid()
  ));
CREATE INDEX idx_agreements_product ON public.franchise_agreements(product_id);
CREATE INDEX idx_agreements_franchisee ON public.franchise_agreements(franchisee_id);
CREATE INDEX idx_agreements_status ON public.franchise_agreements(status);
CREATE TRIGGER trg_agreements_updated_at BEFORE UPDATE ON public.franchise_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Franchisee documents
CREATE TYPE public.franchisee_document_kind AS ENUM
  ('aadhaar','pan','gst','agreement','brochure','photo','bank','other');
CREATE TABLE public.franchisee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchisee_id UUID NOT NULL REFERENCES public.franchisees(id) ON DELETE CASCADE,
  kind public.franchisee_document_kind NOT NULL DEFAULT 'other',
  file_url TEXT NOT NULL,
  storage_path TEXT,
  file_name TEXT,
  content_type TEXT,
  size_bytes BIGINT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchisee_documents TO authenticated;
GRANT ALL ON public.franchisee_documents TO service_role;
ALTER TABLE public.franchisee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage franchisee documents" ON public.franchisee_documents
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Franchisees read own documents" ON public.franchisee_documents
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.franchisees f WHERE f.id = franchisee_documents.franchisee_id AND f.user_id = auth.uid()
  ));
CREATE POLICY "Franchisees upload own documents" ON public.franchisee_documents
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.franchisees f WHERE f.id = franchisee_documents.franchisee_id AND f.user_id = auth.uid()
  ));
CREATE INDEX idx_franchisee_docs_franchisee ON public.franchisee_documents(franchisee_id);
CREATE INDEX idx_franchisee_docs_kind ON public.franchisee_documents(kind);
CREATE TRIGGER trg_franchisee_docs_updated_at BEFORE UPDATE ON public.franchisee_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();