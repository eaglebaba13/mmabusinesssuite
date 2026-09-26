CREATE OR REPLACE FUNCTION public.sales_unassigned_lead_queue()
RETURNS TABLE (id uuid, city text, source public.lead_source, stage public.lead_stage, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'sales'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT l.id, l.city, l.source, l.stage, l.created_at
    FROM public.leads l WHERE l.assigned_to IS NULL
    ORDER BY l.created_at DESC LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.sales_unassigned_lead_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_unassigned_lead_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_claim_lead(p_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'sales'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.leads SET assigned_to = auth.uid()
  WHERE id = p_lead_id AND assigned_to IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.sales_claim_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_claim_lead(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.franchise_product_catalog()
RETURNS TABLE (id uuid, name text, sku text, description text, category_id uuid, unit text, hsn_code text, sale_price numeric, mrp numeric, image_url text, low_stock_threshold integer, active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.franchisees f WHERE f.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.id, p.name, p.sku, p.description, p.category_id,
    p.unit, p.hsn_code, p.sale_price, p.mrp, p.image_url, p.low_stock_threshold, p.active
    FROM public.products p WHERE p.active = true ORDER BY p.name;
END;
$$;
REVOKE ALL ON FUNCTION public.franchise_product_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.franchise_product_catalog() TO authenticated;