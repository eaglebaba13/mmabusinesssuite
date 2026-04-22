-- ENUMS
CREATE TYPE public.warehouse_type AS ENUM ('dark_store', 'central_warehouse', 'outlet');
CREATE TYPE public.po_status AS ENUM ('draft', 'sent', 'partially_received', 'received', 'cancelled');
CREATE TYPE public.movement_type AS ENUM ('purchase_in', 'sale_out', 'transfer', 'adjustment');

-- PRODUCT CATEGORIES
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  unit text NOT NULL DEFAULT 'pcs',
  hsn_code text,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  sale_price numeric(12,2) NOT NULL DEFAULT 0,
  mrp numeric(12,2) NOT NULL DEFAULT 0,
  image_url text,
  low_stock_threshold integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_active ON public.products(active);

-- WAREHOUSES
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  type public.warehouse_type NOT NULL DEFAULT 'dark_store',
  address text,
  city text,
  state text,
  franchisee_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- STOCK LEVELS
CREATE TABLE public.stock_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, warehouse_id)
);
CREATE INDEX idx_stock_levels_product ON public.stock_levels(product_id);
CREATE INDEX idx_stock_levels_warehouse ON public.stock_levels(warehouse_id);

-- SUPPLIERS
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  gstin text,
  address text,
  city text,
  state text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PURCHASE ORDERS
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status public.po_status NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  received_date date,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_po_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX idx_po_warehouse ON public.purchase_orders(warehouse_id);
CREATE INDEX idx_po_status ON public.purchase_orders(status);

-- PURCHASE ORDER ITEMS
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  ordered_qty numeric(14,2) NOT NULL DEFAULT 0,
  received_qty numeric(14,2) NOT NULL DEFAULT 0,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_poi_po ON public.purchase_order_items(po_id);

-- STOCK MOVEMENTS (audit trail)
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  source_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  destination_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  quantity numeric(14,2) NOT NULL,
  movement_type public.movement_type NOT NULL,
  reference_type text,
  reference_id uuid,
  reason text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sm_product ON public.stock_movements(product_id);
CREATE INDEX idx_sm_created ON public.stock_movements(created_at DESC);

-- TRIGGER: auto-apply movement to stock_levels
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.movement_type = 'purchase_in' AND NEW.destination_warehouse_id IS NOT NULL THEN
    INSERT INTO public.stock_levels (product_id, warehouse_id, quantity, updated_at)
    VALUES (NEW.product_id, NEW.destination_warehouse_id, NEW.quantity, now())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = stock_levels.quantity + NEW.quantity, updated_at = now();

  ELSIF NEW.movement_type = 'sale_out' AND NEW.source_warehouse_id IS NOT NULL THEN
    INSERT INTO public.stock_levels (product_id, warehouse_id, quantity, updated_at)
    VALUES (NEW.product_id, NEW.source_warehouse_id, -NEW.quantity, now())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = stock_levels.quantity - NEW.quantity, updated_at = now();

  ELSIF NEW.movement_type = 'transfer' THEN
    IF NEW.source_warehouse_id IS NOT NULL THEN
      INSERT INTO public.stock_levels (product_id, warehouse_id, quantity, updated_at)
      VALUES (NEW.product_id, NEW.source_warehouse_id, -NEW.quantity, now())
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET quantity = stock_levels.quantity - NEW.quantity, updated_at = now();
    END IF;
    IF NEW.destination_warehouse_id IS NOT NULL THEN
      INSERT INTO public.stock_levels (product_id, warehouse_id, quantity, updated_at)
      VALUES (NEW.product_id, NEW.destination_warehouse_id, NEW.quantity, now())
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET quantity = stock_levels.quantity + NEW.quantity, updated_at = now();
    END IF;

  ELSIF NEW.movement_type = 'adjustment' AND NEW.destination_warehouse_id IS NOT NULL THEN
    INSERT INTO public.stock_levels (product_id, warehouse_id, quantity, updated_at)
    VALUES (NEW.product_id, NEW.destination_warehouse_id, NEW.quantity, now())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = stock_levels.quantity + NEW.quantity, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_apply_stock_movement AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- updated_at triggers
CREATE TRIGGER trg_pc_updated BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_p_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_w_updated BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_s_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ENABLE RLS
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- POLICIES: admins + inventory role only
CREATE POLICY "inv_pc_all" ON public.product_categories FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role));

CREATE POLICY "inv_p_all" ON public.products FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role));

CREATE POLICY "inv_w_all" ON public.warehouses FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role));

CREATE POLICY "inv_sl_all" ON public.stock_levels FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role));

CREATE POLICY "inv_s_all" ON public.suppliers FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role));

CREATE POLICY "inv_po_all" ON public.purchase_orders FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role));

CREATE POLICY "inv_poi_all" ON public.purchase_order_items FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role));

CREATE POLICY "inv_sm_all" ON public.stock_movements FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'inventory'::app_role));