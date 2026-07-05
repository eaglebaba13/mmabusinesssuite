
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS franchise_product_id uuid REFERENCES public.franchise_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interest_stage text;

CREATE INDEX IF NOT EXISTS idx_leads_franchise_product_id ON public.leads(franchise_product_id);
CREATE INDEX IF NOT EXISTS idx_leads_interest_stage ON public.leads(interest_stage);
CREATE INDEX IF NOT EXISTS idx_franchisees_franchise_product_id ON public.franchisees(franchise_product_id);

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_interest_stage_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_interest_stage_check
  CHECK (interest_stage IS NULL OR interest_stage IN ('interested','shortlisted','negotiating','won','lost'));
