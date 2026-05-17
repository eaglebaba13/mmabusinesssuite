
-- Schema additions for franchise/intercompany tagging + source PDF link
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS franchisee_id uuid REFERENCES public.franchisees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS state_franchise_id uuid REFERENCES public.state_franchises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_intercompany boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_document_url text,
  ADD COLUMN IF NOT EXISTS source_document_ref text;

CREATE INDEX IF NOT EXISTS idx_invoices_franchisee ON public.invoices(franchisee_id);
CREATE INDEX IF NOT EXISTS idx_invoices_state_franchise ON public.invoices(state_franchise_id);
CREATE INDEX IF NOT EXISTS idx_invoices_is_intercompany ON public.invoices(is_intercompany);

-- City franchisee can read invoices tagged to them (read-only)
DROP POLICY IF EXISTS invoices_franchisee_read ON public.invoices;
CREATE POLICY invoices_franchisee_read ON public.invoices
  FOR SELECT TO authenticated
  USING (
    franchisee_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.franchisees f WHERE f.id = invoices.franchisee_id AND f.user_id = auth.uid())
  );

-- State franchisee can read invoices tagged under their territory
DROP POLICY IF EXISTS invoices_state_read ON public.invoices;
CREATE POLICY invoices_state_read ON public.invoices
  FOR SELECT TO authenticated
  USING (
    (state_franchise_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.state_franchises sf WHERE sf.id = invoices.state_franchise_id AND sf.user_id = auth.uid()))
    OR (franchisee_id IS NOT NULL AND public.state_franchise_owns_franchisee(auth.uid(), franchisee_id))
  );

-- Same scoping for invoice_items
DROP POLICY IF EXISTS invoice_items_franchisee_read ON public.invoice_items;
CREATE POLICY invoice_items_franchisee_read ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.franchisees f ON f.id = i.franchisee_id
      WHERE i.id = invoice_items.invoice_id AND f.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS invoice_items_state_read ON public.invoice_items;
CREATE POLICY invoice_items_state_read ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND (
          (i.state_franchise_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.state_franchises sf WHERE sf.id = i.state_franchise_id AND sf.user_id = auth.uid()))
          OR (i.franchisee_id IS NOT NULL AND public.state_franchise_owns_franchisee(auth.uid(), i.franchisee_id))
        )
    )
  );

-- Auto-derive state_franchise_id from franchisee_id->territory->state_franchise
CREATE OR REPLACE FUNCTION public.derive_invoice_state_franchise()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.franchisee_id IS NOT NULL AND NEW.state_franchise_id IS NULL THEN
    SELECT t.state_franchise_id INTO NEW.state_franchise_id
    FROM public.franchisees f
    JOIN public.territories t ON t.id = f.territory_id
    WHERE f.id = NEW.franchisee_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_derive_sf ON public.invoices;
CREATE TRIGGER trg_invoices_derive_sf
  BEFORE INSERT OR UPDATE OF franchisee_id ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.derive_invoice_state_franchise();
