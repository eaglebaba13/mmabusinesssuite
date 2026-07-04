
-- Dedupe roi_payouts first
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY franchisee_id, payout_month
    ORDER BY (status='paid') DESC, total_amount DESC, created_at DESC
  ) AS rn
  FROM public.roi_payouts
)
DELETE FROM public.roi_payouts WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 1) Franchisees
ALTER TABLE public.franchisees
  ADD COLUMN IF NOT EXISTS agreement_version TEXT,
  ADD COLUMN IF NOT EXISTS agreement_date DATE,
  ADD COLUMN IF NOT EXISTS agreement_expiry DATE,
  ADD COLUMN IF NOT EXISTS franchise_type TEXT NOT NULL DEFAULT 'city' CHECK (franchise_type IN ('master','state','city')),
  ADD COLUMN IF NOT EXISTS mg_percent NUMERIC(6,3) NOT NULL DEFAULT 3.000,
  ADD COLUMN IF NOT EXISTS tns_percent NUMERIC(6,3) NOT NULL DEFAULT 10.000,
  ADD COLUMN IF NOT EXISTS academy_percent NUMERIC(6,3) NOT NULL DEFAULT 10.000,
  ADD COLUMN IF NOT EXISTS mall_percent NUMERIC(6,3) NOT NULL DEFAULT 3.000,
  ADD COLUMN IF NOT EXISTS royalty_percent NUMERIC(6,3) NOT NULL DEFAULT 5.000,
  ADD COLUMN IF NOT EXISTS franchise_commission_amount NUMERIC(14,2) NOT NULL DEFAULT 46500;

-- 2) Invoice enums + columns
DO $$ BEGIN
  CREATE TYPE public.invoice_category AS ENUM (
    'tns_turnover','academy_sales','mall_of_salon_sales',
    'franchise_fee','royalty','product_sales','service_sales','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.franchise_mapping_type AS ENUM ('company_direct','master','state','city');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS franchise_mapping_type public.franchise_mapping_type NOT NULL DEFAULT 'company_direct',
  ADD COLUMN IF NOT EXISTS invoice_category public.invoice_category NOT NULL DEFAULT 'other';

CREATE INDEX IF NOT EXISTS idx_invoices_category_month
  ON public.invoices (franchisee_id, invoice_category, invoice_date);

-- 3) roi_payouts engine outputs
ALTER TABLE public.roi_payouts
  ADD COLUMN IF NOT EXISTS tns_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS academy_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mall_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mg_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variable_roi   NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_payable  NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payable_reason TEXT,
  ADD COLUMN IF NOT EXISTS auto_computed  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_roi_payouts_franchisee_month
  ON public.roi_payouts (franchisee_id, payout_month);

-- 4) Agreement audit log
CREATE TABLE IF NOT EXISTS public.agreement_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchisee_id UUID NOT NULL REFERENCES public.franchisees(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agreement_audit_log TO authenticated;
GRANT ALL ON public.agreement_audit_log TO service_role;
ALTER TABLE public.agreement_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agreement_audit admin read" ON public.agreement_audit_log;
DROP POLICY IF EXISTS "agreement_audit admin insert" ON public.agreement_audit_log;
CREATE POLICY "agreement_audit admin read" ON public.agreement_audit_log
  FOR SELECT USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts'));
CREATE POLICY "agreement_audit admin insert" ON public.agreement_audit_log
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'accounts'));

-- 5) org_roi_settings
CREATE TABLE IF NOT EXISTS public.org_roi_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT TRUE UNIQUE,
  default_mg_percent      NUMERIC(6,3) NOT NULL DEFAULT 3,
  default_tns_percent     NUMERIC(6,3) NOT NULL DEFAULT 10,
  default_academy_percent NUMERIC(6,3) NOT NULL DEFAULT 10,
  default_mall_percent    NUMERIC(6,3) NOT NULL DEFAULT 3,
  default_royalty_percent NUMERIC(6,3) NOT NULL DEFAULT 5,
  default_commission      NUMERIC(14,2) NOT NULL DEFAULT 46500,
  gst_mode TEXT NOT NULL DEFAULT 'exclusive' CHECK (gst_mode IN ('inclusive','exclusive')),
  calc_method TEXT NOT NULL DEFAULT 'max_of_mg_or_variable',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.org_roi_settings TO authenticated;
GRANT ALL ON public.org_roi_settings TO service_role;
ALTER TABLE public.org_roi_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "roi_settings read all authed" ON public.org_roi_settings;
DROP POLICY IF EXISTS "roi_settings admin write" ON public.org_roi_settings;
CREATE POLICY "roi_settings read all authed" ON public.org_roi_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "roi_settings admin write" ON public.org_roi_settings
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
INSERT INTO public.org_roi_settings (singleton) VALUES (TRUE) ON CONFLICT (singleton) DO NOTHING;

-- 6) Formula RPC
CREATE OR REPLACE FUNCTION public.compute_franchisee_monthly_roi(_franchisee_id UUID, _month DATE)
RETURNS TABLE (
  tns_total NUMERIC, academy_total NUMERIC, mall_total NUMERIC,
  a NUMERIC, b NUMERIC, c NUMERIC,
  variable_roi NUMERIC, mg NUMERIC, final_payable NUMERIC, reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f RECORD;
  m_start DATE := date_trunc('month', _month)::date;
  m_end   DATE := (date_trunc('month', _month) + interval '1 month - 1 day')::date;
BEGIN
  SELECT investment_amount, mg_percent, tns_percent, academy_percent, mall_percent
    INTO f FROM public.franchisees WHERE id = _franchisee_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(CASE WHEN invoice_category='tns_turnover'        THEN grand_total END),0),
    COALESCE(SUM(CASE WHEN invoice_category='academy_sales'       THEN grand_total END),0),
    COALESCE(SUM(CASE WHEN invoice_category='mall_of_salon_sales' THEN grand_total END),0)
  INTO tns_total, academy_total, mall_total
  FROM public.invoices
  WHERE franchisee_id = _franchisee_id
    AND status <> 'cancelled'
    AND archived_at IS NULL
    AND invoice_date BETWEEN m_start AND m_end;

  a := tns_total     * f.tns_percent     / 100;
  b := academy_total * f.academy_percent / 100;
  c := mall_total    * f.mall_percent    / 100;
  variable_roi := a + b + c;
  mg := COALESCE(f.investment_amount,0) * f.mg_percent / 100;

  IF variable_roi >= mg THEN
    final_payable := variable_roi; reason := 'Variable ROI exceeded MG';
  ELSE
    final_payable := mg;           reason := 'Minimum Guarantee Applied';
  END IF;
  RETURN NEXT;
END $$;

-- 7) Upsert helper
CREATE OR REPLACE FUNCTION public.recompute_roi_payout(_franchisee_id UUID, _month DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; m_start DATE := date_trunc('month', _month)::date;
BEGIN
  IF _franchisee_id IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.compute_franchisee_monthly_roi(_franchisee_id, m_start);

  INSERT INTO public.roi_payouts (
    franchisee_id, payout_month,
    tns_amount, academy_amount, mall_amount,
    mg_amount, variable_roi, final_payable, payable_reason,
    base_roi, emporium_incentive, academy_incentive, dark_store_incentive, total_amount,
    status, auto_computed
  ) VALUES (
    _franchisee_id, m_start,
    r.tns_total, r.academy_total, r.mall_total,
    r.mg, r.variable_roi, r.final_payable, r.reason,
    r.mg, r.a, r.b, r.c, r.final_payable,
    'pending', TRUE
  )
  ON CONFLICT (franchisee_id, payout_month) DO UPDATE SET
    tns_amount = EXCLUDED.tns_amount,
    academy_amount = EXCLUDED.academy_amount,
    mall_amount = EXCLUDED.mall_amount,
    mg_amount = EXCLUDED.mg_amount,
    variable_roi = EXCLUDED.variable_roi,
    final_payable = EXCLUDED.final_payable,
    payable_reason = EXCLUDED.payable_reason,
    total_amount = CASE WHEN roi_payouts.auto_computed AND roi_payouts.status <> 'paid'
                        THEN EXCLUDED.final_payable ELSE roi_payouts.total_amount END,
    auto_computed = TRUE
  WHERE roi_payouts.status <> 'paid';
END $$;

-- 8) Invoice trigger
CREATE OR REPLACE FUNCTION public.trg_invoices_recompute_roi()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.franchisee_id IS NOT NULL THEN
      PERFORM public.recompute_roi_payout(OLD.franchisee_id, OLD.invoice_date);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.franchisee_id IS NOT NULL THEN
    PERFORM public.recompute_roi_payout(NEW.franchisee_id, NEW.invoice_date);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.franchisee_id IS NOT NULL
     AND (OLD.franchisee_id <> NEW.franchisee_id
          OR date_trunc('month',OLD.invoice_date) <> date_trunc('month',NEW.invoice_date)) THEN
    PERFORM public.recompute_roi_payout(OLD.franchisee_id, OLD.invoice_date);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS invoices_recompute_roi ON public.invoices;
CREATE TRIGGER invoices_recompute_roi
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_recompute_roi();

-- 9) Agreement audit trigger
CREATE OR REPLACE FUNCTION public.trg_franchisee_agreement_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF NEW.mg_percent      IS DISTINCT FROM OLD.mg_percent      THEN INSERT INTO public.agreement_audit_log(franchisee_id,field,old_value,new_value,changed_by) VALUES (NEW.id,'mg_percent',OLD.mg_percent::text,NEW.mg_percent::text,uid); END IF;
  IF NEW.tns_percent     IS DISTINCT FROM OLD.tns_percent     THEN INSERT INTO public.agreement_audit_log(franchisee_id,field,old_value,new_value,changed_by) VALUES (NEW.id,'tns_percent',OLD.tns_percent::text,NEW.tns_percent::text,uid); END IF;
  IF NEW.academy_percent IS DISTINCT FROM OLD.academy_percent THEN INSERT INTO public.agreement_audit_log(franchisee_id,field,old_value,new_value,changed_by) VALUES (NEW.id,'academy_percent',OLD.academy_percent::text,NEW.academy_percent::text,uid); END IF;
  IF NEW.mall_percent    IS DISTINCT FROM OLD.mall_percent    THEN INSERT INTO public.agreement_audit_log(franchisee_id,field,old_value,new_value,changed_by) VALUES (NEW.id,'mall_percent',OLD.mall_percent::text,NEW.mall_percent::text,uid); END IF;
  IF NEW.royalty_percent IS DISTINCT FROM OLD.royalty_percent THEN INSERT INTO public.agreement_audit_log(franchisee_id,field,old_value,new_value,changed_by) VALUES (NEW.id,'royalty_percent',OLD.royalty_percent::text,NEW.royalty_percent::text,uid); END IF;
  IF NEW.franchise_commission_amount IS DISTINCT FROM OLD.franchise_commission_amount THEN INSERT INTO public.agreement_audit_log(franchisee_id,field,old_value,new_value,changed_by) VALUES (NEW.id,'franchise_commission_amount',OLD.franchise_commission_amount::text,NEW.franchise_commission_amount::text,uid); END IF;
  IF NEW.agreement_version IS DISTINCT FROM OLD.agreement_version THEN INSERT INTO public.agreement_audit_log(franchisee_id,field,old_value,new_value,changed_by) VALUES (NEW.id,'agreement_version',OLD.agreement_version,NEW.agreement_version,uid); END IF;
  IF NEW.agreement_expiry  IS DISTINCT FROM OLD.agreement_expiry  THEN INSERT INTO public.agreement_audit_log(franchisee_id,field,old_value,new_value,changed_by) VALUES (NEW.id,'agreement_expiry',OLD.agreement_expiry::text,NEW.agreement_expiry::text,uid); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS franchisee_agreement_audit ON public.franchisees;
CREATE TRIGGER franchisee_agreement_audit
AFTER UPDATE ON public.franchisees
FOR EACH ROW EXECUTE FUNCTION public.trg_franchisee_agreement_audit();
