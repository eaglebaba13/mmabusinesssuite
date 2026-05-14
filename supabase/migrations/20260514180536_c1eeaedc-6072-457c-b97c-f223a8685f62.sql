
-- COMPANIES
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  brand text,
  company_type public.company_type NOT NULL DEFAULT 'operator',
  parent_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  gstin text, pan text, address jsonb,
  contact_email text, contact_phone text,
  invoice_prefix text,
  active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_parent ON public.companies(parent_company_id);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_admin_all ON public.companies FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'));
CREATE POLICY companies_read_auth ON public.companies FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND active = true);

INSERT INTO public.companies (name, legal_name, brand, company_type, invoice_prefix)
SELECT 'HDK BEAUTY I PVT LTD','HDK BEAUTY I PRIVATE LIMITED','HDK','group','HDK'
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE name='HDK BEAUTY I PVT LTD');
INSERT INTO public.companies (name, legal_name, brand, company_type, parent_company_id, invoice_prefix)
SELECT 'MallofSalon','MallofSalon','MOS','distributor',
  (SELECT id FROM public.companies WHERE name='HDK BEAUTY I PVT LTD'),'MOS'
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE name='MallofSalon');
INSERT INTO public.companies (name, legal_name, brand, company_type, parent_company_id, invoice_prefix)
SELECT 'Nail Emporium','Nail Emporium','Nail Emporium','retailer',
  (SELECT id FROM public.companies WHERE name='MallofSalon'),'NE'
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE name='Nail Emporium');
INSERT INTO public.companies (name, legal_name, brand, company_type, parent_company_id, invoice_prefix)
SELECT 'X Nail Bar','X Nail Bar','X Nail Bar','operator',
  (SELECT id FROM public.companies WHERE name='Nail Emporium'),'XNB'
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE name='X Nail Bar');

-- NUMBERING
CREATE TABLE IF NOT EXISTS public.invoice_numbering_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_type public.invoice_doc_type NOT NULL,
  prefix text NOT NULL,
  financial_year text NOT NULL,
  current_seq integer NOT NULL DEFAULT 0,
  format text NOT NULL DEFAULT '{PREFIX}/{FY}/{SEQ:5}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_type, financial_year)
);
ALTER TABLE public.invoice_numbering_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY inr_admin_all ON public.invoice_numbering_rules FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'));

-- INVOICES
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  bill_to_company_id uuid REFERENCES public.companies(id),
  bill_to_entity_type public.entity_type,
  bill_to_entity_id uuid,
  bill_to_name text,
  bill_to_gstin text,
  bill_to_address jsonb,
  doc_type public.invoice_doc_type NOT NULL DEFAULT 'b2b_tax',
  invoice_number text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  gst_total numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  payment_status public.pos_payment_status NOT NULL DEFAULT 'unpaid',
  status public.invoice_status NOT NULL DEFAULT 'draft',
  parent_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  revision_no integer NOT NULL DEFAULT 0,
  cancellation_reason text,
  notes text,
  issued_at timestamptz,
  issued_by uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_bill_to ON public.invoices(bill_to_entity_type, bill_to_entity_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  description text NOT NULL,
  hsn_code text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_pct numeric NOT NULL DEFAULT 0,
  gst_pct numeric NOT NULL DEFAULT 0,
  line_subtotal numeric NOT NULL DEFAULT 0,
  line_gst numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  is_student_product boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_admin_all ON public.invoices FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts') OR has_role(auth.uid(),'nail_emporium'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts') OR has_role(auth.uid(),'nail_emporium'));
CREATE POLICY invoices_audit_read ON public.invoices FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'auditor') OR has_role(auth.uid(),'founder'));
CREATE POLICY invoice_items_admin_all ON public.invoice_items FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts') OR has_role(auth.uid(),'nail_emporium'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts') OR has_role(auth.uid(),'nail_emporium'));
CREATE POLICY invoice_items_audit_read ON public.invoice_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'auditor') OR has_role(auth.uid(),'founder'));

CREATE OR REPLACE FUNCTION public.compute_invoice_item_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE base numeric; after_disc numeric;
BEGIN
  base := NEW.quantity * NEW.unit_price;
  after_disc := base - (base * COALESCE(NEW.discount_pct,0)/100);
  NEW.line_subtotal := after_disc;
  NEW.line_gst := after_disc * COALESCE(NEW.gst_pct,0)/100;
  NEW.line_total := after_disc + NEW.line_gst;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_item_totals ON public.invoice_items;
CREATE TRIGGER trg_invoice_item_totals BEFORE INSERT OR UPDATE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_invoice_item_totals();

CREATE OR REPLACE FUNCTION public.recalc_invoice_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE iid uuid; sub numeric; disc numeric; gst numeric; grand numeric;
BEGIN
  iid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(line_subtotal),0),
         COALESCE(SUM(quantity*unit_price*discount_pct/100),0),
         COALESCE(SUM(line_gst),0),
         COALESCE(SUM(line_total),0)
  INTO sub, disc, gst, grand
  FROM public.invoice_items WHERE invoice_id = iid;
  UPDATE public.invoices SET subtotal=sub, discount_total=disc, gst_total=gst, grand_total=grand, updated_at=now() WHERE id=iid;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_recalc ON public.invoice_items;
CREATE TRIGGER trg_invoice_recalc AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_invoice_totals();

-- PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction public.payment_direction NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  counterparty_entity_type public.entity_type,
  counterparty_entity_id uuid,
  counterparty_name text,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method public.payment_method NOT NULL DEFAULT 'bank_transfer',
  reference text, notes text,
  status text NOT NULL DEFAULT 'completed',
  recorded_by uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_company ON public.payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_admin_all ON public.payments FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'));
CREATE POLICY payments_audit_read ON public.payments FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'auditor') OR has_role(auth.uid(),'founder'));

-- SALON BRANCHES
CREATE TABLE IF NOT EXISTS public.salon_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  parent_brand text NOT NULL DEFAULT 'nail_emporium',
  company_id uuid REFERENCES public.companies(id),
  territory_id uuid REFERENCES public.territories(id),
  city text, state text, address jsonb,
  manager_user_id uuid,
  status text NOT NULL DEFAULT 'active',
  service_catalog jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.salon_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY salon_branches_admin_all ON public.salon_branches FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts') OR has_role(auth.uid(),'nail_emporium'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts') OR has_role(auth.uid(),'nail_emporium'));
CREATE POLICY salon_branches_self_read ON public.salon_branches FOR SELECT TO authenticated
  USING (manager_user_id = auth.uid());

ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS salon_branch_id uuid REFERENCES public.salon_branches(id);
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- STATE LEDGERS
CREATE TABLE IF NOT EXISTS public.state_franchise_roi_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_franchise_id uuid NOT NULL REFERENCES public.state_franchises(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  basis_amount numeric NOT NULL DEFAULT 0,
  roi_pct numeric NOT NULL DEFAULT 3,
  roi_due numeric NOT NULL DEFAULT 0,
  status public.ledger_status NOT NULL DEFAULT 'accrued',
  paid_amount numeric NOT NULL DEFAULT 0,
  paid_at timestamptz,
  notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state_franchise_id, period_month)
);
ALTER TABLE public.state_franchise_roi_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY sfrl_admin_all ON public.state_franchise_roi_ledger FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'));
CREATE POLICY sfrl_self_read ON public.state_franchise_roi_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM state_franchises sf WHERE sf.id = state_franchise_roi_ledger.state_franchise_id AND sf.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.state_franchise_incentive_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_franchise_id uuid NOT NULL REFERENCES public.state_franchises(id) ON DELETE CASCADE,
  kind text NOT NULL,
  related_entity_type public.entity_type,
  related_entity_id uuid,
  basis_amount numeric,
  pct numeric,
  amount numeric NOT NULL DEFAULT 0,
  period_month date NOT NULL,
  status public.ledger_status NOT NULL DEFAULT 'accrued',
  paid_amount numeric NOT NULL DEFAULT 0,
  paid_at timestamptz,
  notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sfil_sf ON public.state_franchise_incentive_ledger(state_franchise_id, period_month);
ALTER TABLE public.state_franchise_incentive_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY sfil_admin_all ON public.state_franchise_incentive_ledger FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'));
CREATE POLICY sfil_self_read ON public.state_franchise_incentive_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM state_franchises sf WHERE sf.id = state_franchise_incentive_ledger.state_franchise_id AND sf.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.state_franchise_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_franchise_id uuid NOT NULL REFERENCES public.state_franchises(id) ON DELETE CASCADE,
  contract_year integer NOT NULL DEFAULT 1,
  target_count integer NOT NULL DEFAULT 10,
  activated_count integer NOT NULL DEFAULT 0,
  per_activation_amount numeric NOT NULL DEFAULT 150000,
  starts_on date, ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state_franchise_id, contract_year)
);
ALTER TABLE public.state_franchise_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY sft_admin_all ON public.state_franchise_targets FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'));
CREATE POLICY sft_self_read ON public.state_franchise_targets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM state_franchises sf WHERE sf.id = state_franchise_targets.state_franchise_id AND sf.user_id = auth.uid()));

-- USER ENTITY ACCESS
CREATE TABLE IF NOT EXISTS public.user_entity_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type public.entity_type NOT NULL,
  entity_id uuid NOT NULL,
  can_write boolean NOT NULL DEFAULT false,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_uea_user ON public.user_entity_access(user_id);
ALTER TABLE public.user_entity_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY uea_admin_all ON public.user_entity_access FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
CREATE POLICY uea_self_read ON public.user_entity_access FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.user_has_entity(_user_id uuid, _entity_type public.entity_type, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_entity_access
    WHERE user_id=_user_id AND entity_type=_entity_type AND entity_id=_entity_id)
$$;

-- IMPERSONATION
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acting_admin_id uuid NOT NULL,
  impersonated_user_id uuid,
  entity_type public.entity_type NOT NULL,
  entity_id uuid NOT NULL,
  mode public.impersonation_mode NOT NULL DEFAULT 'read_only',
  token_hash text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  ip text, user_agent text
);
CREATE INDEX IF NOT EXISTS idx_imp_admin ON public.impersonation_sessions(acting_admin_id);
CREATE INDEX IF NOT EXISTS idx_imp_token ON public.impersonation_sessions(token_hash);
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY imp_sessions_admin ON public.impersonation_sessions FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'founder') OR has_role(auth.uid(),'auditor'))
  WITH CHECK (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.impersonation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.impersonation_sessions(id) ON DELETE CASCADE,
  action text NOT NULL,
  resource text,
  payload jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.impersonation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY imp_audit_admin ON public.impersonation_audit FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'founder') OR has_role(auth.uid(),'auditor'))
  WITH CHECK (is_admin(auth.uid()));

-- DOCUMENTS
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type public.entity_type NOT NULL,
  entity_id uuid NOT NULL,
  title text NOT NULL,
  doc_kind text NOT NULL DEFAULT 'other',
  storage_path text,
  external_url text,
  uploaded_by uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docs_entity ON public.documents(entity_type, entity_id);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY docs_admin_all ON public.documents FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'accounts'));
CREATE POLICY docs_self_read ON public.documents FOR SELECT TO authenticated
  USING (user_has_entity(auth.uid(), entity_type, entity_id));

-- TARGET ACTIVATION TRIGGER
CREATE OR REPLACE FUNCTION public.bump_state_target_on_franchisee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sf_id uuid;
BEGIN
  IF NEW.territory_id IS NULL THEN RETURN NEW; END IF;
  SELECT t.state_franchise_id INTO sf_id FROM public.territories t WHERE t.id = NEW.territory_id;
  IF sf_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.state_franchise_targets (state_franchise_id, contract_year, activated_count, starts_on, ends_on)
  VALUES (sf_id, 1, 1, date_trunc('year', NEW.joined_at)::date, (date_trunc('year', NEW.joined_at) + interval '1 year - 1 day')::date)
  ON CONFLICT (state_franchise_id, contract_year)
  DO UPDATE SET activated_count = state_franchise_targets.activated_count + 1, updated_at = now();

  INSERT INTO public.state_franchise_incentive_ledger
    (state_franchise_id, kind, related_entity_type, related_entity_id, amount, period_month, status, notes, is_demo)
  VALUES
    (sf_id, 'city_activation', 'city_franchise', NEW.id, 150000,
     date_trunc('month', NEW.joined_at)::date, 'accrued',
     'Activation incentive for ' || NEW.full_name, COALESCE(NEW.is_demo, false));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_state_target_bump ON public.franchisees;
CREATE TRIGGER trg_state_target_bump AFTER INSERT ON public.franchisees
  FOR EACH ROW WHEN (NEW.status = 'active') EXECUTE FUNCTION public.bump_state_target_on_franchisee();

-- updated_at triggers
DO $$ DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['companies','invoice_numbering_rules','invoices','payments','salon_branches','state_franchise_roi_ledger','state_franchise_incentive_ledger','state_franchise_targets']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', tbl, tbl);
  END LOOP;
END $$;
