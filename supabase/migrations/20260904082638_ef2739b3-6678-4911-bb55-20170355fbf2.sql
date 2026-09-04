-- 1. Franchisee master additions
ALTER TABLE public.franchisees
  ADD COLUMN IF NOT EXISTS franchisee_code text,
  ADD COLUMN IF NOT EXISTS auth_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_holder text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_ifsc text,
  ADD COLUMN IF NOT EXISTS bank_branch text;

-- 2. Claim status enum
DO $$ BEGIN
  CREATE TYPE public.roi_claim_status AS ENUM ('draft','generated','submitted','approved','rejected','paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Sequential claim reference numbers
CREATE SEQUENCE IF NOT EXISTS public.roi_claim_ref_seq START WITH 3200 INCREMENT BY 1;

-- 4. ROI claims
CREATE TABLE IF NOT EXISTS public.roi_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL UNIQUE REFERENCES public.roi_payouts(id) ON DELETE CASCADE,
  franchisee_id uuid NOT NULL REFERENCES public.franchisees(id) ON DELETE CASCADE,
  claim_ref_no integer NOT NULL UNIQUE DEFAULT nextval('public.roi_claim_ref_seq'),
  claim_period date NOT NULL,
  submitted_on date NOT NULL DEFAULT CURRENT_DATE,
  activity_type text NOT NULL DEFAULT 'Marketing & Promotions',
  description text,
  fix_roi_amount numeric NOT NULL DEFAULT 0,
  shopify_amount numeric NOT NULL DEFAULT 0,
  tns_amount numeric NOT NULL DEFAULT 0,
  total_claimed numeric NOT NULL DEFAULT 0,
  net_payable numeric NOT NULL DEFAULT 0,
  status public.roi_claim_status NOT NULL DEFAULT 'generated',
  version integer NOT NULL DEFAULT 1,
  pdf_path text,
  docx_path text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roi_claims TO authenticated;
GRANT ALL ON public.roi_claims TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.roi_claim_ref_seq TO authenticated;
GRANT ALL ON SEQUENCE public.roi_claim_ref_seq TO service_role;
ALTER TABLE public.roi_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance staff manage roi claims"
ON public.roi_claims FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'founder')
  OR public.has_role(auth.uid(), 'accounts')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'founder')
  OR public.has_role(auth.uid(), 'accounts')
);

CREATE POLICY "Franchisee views own roi claims"
ON public.roi_claims FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.franchisees f
    WHERE f.id = roi_claims.franchisee_id
      AND (f.user_id = auth.uid() OR f.manager_user_id = auth.uid())
  )
);

CREATE INDEX IF NOT EXISTS roi_claims_franchisee_idx ON public.roi_claims(franchisee_id);

-- 5. Version history / audit trail
CREATE TABLE IF NOT EXISTS public.roi_claim_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.roi_claims(id) ON DELETE CASCADE,
  version integer NOT NULL,
  action text NOT NULL DEFAULT 'generated',
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_path text,
  docx_path text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.roi_claim_versions TO authenticated;
GRANT ALL ON public.roi_claim_versions TO service_role;
ALTER TABLE public.roi_claim_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance staff read claim versions"
ON public.roi_claim_versions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'founder')
  OR public.has_role(auth.uid(), 'accounts')
);

CREATE POLICY "Finance staff insert claim versions"
ON public.roi_claim_versions FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'founder')
  OR public.has_role(auth.uid(), 'accounts')
);

CREATE INDEX IF NOT EXISTS roi_claim_versions_claim_idx ON public.roi_claim_versions(claim_id);

CREATE TRIGGER roi_claims_set_updated_at
BEFORE UPDATE ON public.roi_claims
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();