
-- Add GST split columns + place of supply on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS from_state text,
  ADD COLUMN IF NOT EXISTS tax_mode text CHECK (tax_mode IN ('intra','inter')),
  ADD COLUMN IF NOT EXISTS cgst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_total numeric NOT NULL DEFAULT 0;

-- Update recalc trigger to also maintain CGST/SGST/IGST split based on tax_mode
CREATE OR REPLACE FUNCTION public.recalc_invoice_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  iid uuid; sub numeric; disc numeric; gst numeric; grand numeric;
  mode text;
  cgst numeric := 0; sgst numeric := 0; igst numeric := 0;
BEGIN
  iid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(line_subtotal),0),
         COALESCE(SUM(quantity*unit_price*discount_pct/100),0),
         COALESCE(SUM(line_gst),0),
         COALESCE(SUM(line_total),0)
  INTO sub, disc, gst, grand
  FROM public.invoice_items WHERE invoice_id = iid;

  SELECT tax_mode INTO mode FROM public.invoices WHERE id = iid;
  IF mode = 'inter' THEN
    igst := gst;
  ELSE
    -- intra or unset → split equally; legacy rows keep gst_total visible
    cgst := gst / 2;
    sgst := gst / 2;
  END IF;

  UPDATE public.invoices
    SET subtotal = sub,
        discount_total = disc,
        gst_total = gst,
        cgst_total = cgst,
        sgst_total = sgst,
        igst_total = igst,
        grand_total = grand,
        updated_at = now()
    WHERE id = iid;
  RETURN NULL;
END $function$;
