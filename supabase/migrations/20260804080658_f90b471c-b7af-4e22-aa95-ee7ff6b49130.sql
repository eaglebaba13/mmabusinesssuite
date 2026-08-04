ALTER TABLE public.franchisees
  ADD COLUMN IF NOT EXISTS effective_product_date date,
  ADD COLUMN IF NOT EXISTS product_change_reason text,
  ADD COLUMN IF NOT EXISTS product_change_note text;

CREATE TABLE IF NOT EXISTS public.franchise_product_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchisee_id uuid NOT NULL REFERENCES public.franchisees(id) ON DELETE CASCADE,
  old_product_id uuid REFERENCES public.franchise_products(id) ON DELETE SET NULL,
  new_product_id uuid REFERENCES public.franchise_products(id) ON DELETE SET NULL,
  old_values_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'apply_defaults',
  reason text,
  remarks text,
  effective_date date NOT NULL DEFAULT current_date,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS franchise_product_changes_franchisee_idx
  ON public.franchise_product_changes(franchisee_id, changed_at DESC);

GRANT SELECT, INSERT ON public.franchise_product_changes TO authenticated;
GRANT ALL ON public.franchise_product_changes TO service_role;

ALTER TABLE public.franchise_product_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view product change history"
  ON public.franchise_product_changes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'founder')
    OR public.has_role(auth.uid(), 'accounts')
    OR EXISTS (
      SELECT 1 FROM public.franchisees f
      WHERE f.id = franchise_product_changes.franchisee_id
        AND f.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert product change history"
  ON public.franchise_product_changes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'founder')
  );