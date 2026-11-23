-- Phase 3: Franchise Territory / Outlet Allotment & Multi-Territory Mapping
-- Strict super_admin governance, operational ownership (DIRECT_COMPANY vs FRANCHISE)

-- 1. Add ownership_type to territories and salon_branches
ALTER TABLE public.territories 
  ADD COLUMN IF NOT EXISTS ownership_type text NOT NULL DEFAULT 'FRANCHISE' 
  CHECK (ownership_type IN ('FRANCHISE', 'DIRECT_COMPANY'));

ALTER TABLE public.salon_branches 
  ADD COLUMN IF NOT EXISTS ownership_type text NOT NULL DEFAULT 'DIRECT_COMPANY' 
  CHECK (ownership_type IN ('DIRECT_COMPANY', 'FRANCHISE'));

-- 2. Ensure standard territories exist for franchise city networks
INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Udaipur', 'Rajasthan', 'North', 'DIRECT_COMPANY', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'udaipur');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Surat', 'Gujarat', 'West', 'FRANCHISE', '16788acf-232e-452b-aa74-6942074f74a4'
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'surat');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Vadodara', 'Gujarat', 'West', 'FRANCHISE', '16788acf-232e-452b-aa74-6942074f74a4'
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'vadodara');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Nanded', 'Maharashtra', 'West', 'FRANCHISE', '11111111-1111-1111-1111-111111111101'
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'nanded');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Aurangabad', 'Maharashtra', 'West', 'FRANCHISE', '11111111-1111-1111-1111-111111111101'
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'aurangabad');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Kolhapur', 'Maharashtra', 'West', 'FRANCHISE', '11111111-1111-1111-1111-111111111101'
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'kolhapur');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Beawar', 'Rajasthan', 'North', 'FRANCHISE', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'beawar');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Ujjain', 'Madhya Pradesh', 'Central', 'FRANCHISE', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'ujjain');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Ranchi', 'Jharkhand', 'East', 'FRANCHISE', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'ranchi');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Allahabad', 'Uttar Pradesh', 'North', 'FRANCHISE', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'allahabad');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Sriganganagar', 'Rajasthan', 'North', 'FRANCHISE', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'sriganganagar');

INSERT INTO public.territories (name, state, region, ownership_type, state_franchise_id)
SELECT 'Noida', 'Uttar Pradesh', 'North', 'FRANCHISE', '11111111-1111-1111-1111-111111111103'
WHERE NOT EXISTS (SELECT 1 FROM public.territories WHERE lower(name) = 'noida');

-- 3. Junction Table: franchisee_territories (1-to-Many mapping)
CREATE TABLE IF NOT EXISTS public.franchisee_territories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    franchisee_id uuid NOT NULL REFERENCES public.franchisees(id) ON DELETE CASCADE,
    territory_id uuid NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
    is_primary boolean NOT NULL DEFAULT true,
    ownership_type text NOT NULL DEFAULT 'FRANCHISE' CHECK (ownership_type IN ('FRANCHISE', 'DIRECT_COMPANY')),
    exclusivity_radius_km numeric NOT NULL DEFAULT 5.0,
    area_name text,
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_franchisee_territory UNIQUE (franchisee_id, territory_id)
);

-- 4. Indexes for rapid lookups and primary filter
CREATE INDEX IF NOT EXISTS idx_franchisee_territories_franchisee ON public.franchisee_territories (franchisee_id);
CREATE INDEX IF NOT EXISTS idx_franchisee_territories_territory ON public.franchisee_territories (territory_id);
CREATE INDEX IF NOT EXISTS idx_franchisee_territories_primary ON public.franchisee_territories (franchisee_id) WHERE is_primary = true;

-- 5. Row Level Security on franchisee_territories
ALTER TABLE public.franchisee_territories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS franchisee_territories_select ON public.franchisee_territories;
CREATE POLICY franchisee_territories_select ON public.franchisee_territories
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS franchisee_territories_insert ON public.franchisee_territories;
CREATE POLICY franchisee_territories_insert ON public.franchisee_territories
    FOR INSERT TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS franchisee_territories_update ON public.franchisee_territories;
CREATE POLICY franchisee_territories_update ON public.franchisee_territories
    FOR UPDATE TO authenticated
    USING (public.has_role(auth.uid(), 'super_admin'::app_role))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS franchisee_territories_delete ON public.franchisee_territories;
CREATE POLICY franchisee_territories_delete ON public.franchisee_territories
    FOR DELETE TO authenticated
    USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 6. RPC: manage_franchisee_territory (governed strictly by super_admin with audit logging)
CREATE OR REPLACE FUNCTION public.manage_franchisee_territory(
    p_action text, -- 'add', 'update', 'delete', 'set_primary'
    p_franchisee_id uuid,
    p_territory_id uuid,
    p_is_primary boolean DEFAULT true,
    p_ownership_type text DEFAULT 'FRANCHISE',
    p_radius_km numeric DEFAULT 5.0,
    p_area_name text DEFAULT NULL,
    p_effective_from date DEFAULT CURRENT_DATE,
    p_effective_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_super boolean;
    v_territory_rec RECORD;
    v_record_id uuid;
    v_meta jsonb;
BEGIN
    -- Strict super_admin role check
    SELECT public.has_role(v_user_id, 'super_admin'::app_role) INTO v_is_super;
    IF NOT COALESCE(v_is_super, false) THEN
        RAISE EXCEPTION 'Forbidden: only super_admin can add, change, or delete franchisee territory allotments';
    END IF;

    -- Fetch territory record
    SELECT id, name, state INTO v_territory_rec FROM public.territories WHERE id = p_territory_id;
    IF v_territory_rec.id IS NULL AND p_action != 'delete' THEN
        RAISE EXCEPTION 'Territory % not found', p_territory_id;
    END IF;

    IF p_action = 'add' THEN
        -- If setting as primary, demote existing primary territories
        IF p_is_primary THEN
            UPDATE public.franchisee_territories 
            SET is_primary = false, updated_at = now() 
            WHERE franchisee_id = p_franchisee_id;
        END IF;

        INSERT INTO public.franchisee_territories (
            franchisee_id, territory_id, is_primary, ownership_type,
            exclusivity_radius_km, area_name, effective_from, effective_to, created_by
        ) VALUES (
            p_franchisee_id, p_territory_id, p_is_primary, p_ownership_type,
            p_radius_km, p_area_name, p_effective_from, p_effective_to, v_user_id
        )
        ON CONFLICT (franchisee_id, territory_id) DO UPDATE SET
            is_primary = EXCLUDED.is_primary,
            ownership_type = EXCLUDED.ownership_type,
            exclusivity_radius_km = EXCLUDED.exclusivity_radius_km,
            area_name = COALESCE(EXCLUDED.area_name, public.franchisee_territories.area_name),
            effective_from = EXCLUDED.effective_from,
            effective_to = EXCLUDED.effective_to,
            updated_at = now()
        RETURNING id INTO v_record_id;

        -- Sync primary territory to franchisees table
        IF p_is_primary THEN
            UPDATE public.franchisees
            SET territory_id = v_territory_rec.id,
                territory_city = v_territory_rec.name,
                territory_state = v_territory_rec.state,
                territory_area = COALESCE(p_area_name, territory_area, v_territory_rec.name),
                territory_radius_km = p_radius_km,
                warehouse_id = CASE WHEN warehouse_id = 'fb6df109-a8a8-4b89-9aab-4fbc28fe3d5c' THEN NULL ELSE warehouse_id END,
                updated_at = now()
            WHERE id = p_franchisee_id;
        END IF;

    ELSIF p_action = 'update' THEN
        IF p_is_primary THEN
            UPDATE public.franchisee_territories 
            SET is_primary = false, updated_at = now() 
            WHERE franchisee_id = p_franchisee_id AND territory_id != p_territory_id;
        END IF;

        UPDATE public.franchisee_territories
        SET is_primary = p_is_primary,
            ownership_type = p_ownership_type,
            exclusivity_radius_km = p_radius_km,
            area_name = p_area_name,
            effective_from = p_effective_from,
            effective_to = p_effective_to,
            updated_at = now()
        WHERE franchisee_id = p_franchisee_id AND territory_id = p_territory_id
        RETURNING id INTO v_record_id;

        IF p_is_primary THEN
            UPDATE public.franchisees
            SET territory_id = v_territory_rec.id,
                territory_city = v_territory_rec.name,
                territory_state = v_territory_rec.state,
                territory_area = COALESCE(p_area_name, territory_area, v_territory_rec.name),
                territory_radius_km = p_radius_km,
                warehouse_id = CASE WHEN warehouse_id = 'fb6df109-a8a8-4b89-9aab-4fbc28fe3d5c' THEN NULL ELSE warehouse_id END,
                updated_at = now()
            WHERE id = p_franchisee_id;
        END IF;

    ELSIF p_action = 'set_primary' THEN
        UPDATE public.franchisee_territories 
        SET is_primary = false, updated_at = now() 
        WHERE franchisee_id = p_franchisee_id;

        UPDATE public.franchisee_territories 
        SET is_primary = true, updated_at = now() 
        WHERE franchisee_id = p_franchisee_id AND territory_id = p_territory_id
        RETURNING id INTO v_record_id;

        UPDATE public.franchisees
        SET territory_id = v_territory_rec.id,
            territory_city = v_territory_rec.name,
            territory_state = v_territory_rec.state,
            territory_area = COALESCE(v_territory_rec.name, territory_area),
            warehouse_id = CASE WHEN warehouse_id = 'fb6df109-a8a8-4b89-9aab-4fbc28fe3d5c' THEN NULL ELSE warehouse_id END,
            updated_at = now()
        WHERE id = p_franchisee_id;

    ELSIF p_action = 'delete' THEN
        DELETE FROM public.franchisee_territories
        WHERE franchisee_id = p_franchisee_id AND territory_id = p_territory_id;

        -- If deleted territory was primary on franchisee, promote another or clear
        IF EXISTS (SELECT 1 FROM public.franchisees WHERE id = p_franchisee_id AND territory_id = p_territory_id) THEN
            SELECT territory_id INTO v_record_id 
            FROM public.franchisee_territories 
            WHERE franchisee_id = p_franchisee_id 
            ORDER BY is_primary DESC, created_at ASC LIMIT 1;

            IF v_record_id IS NOT NULL THEN
                UPDATE public.franchisee_territories SET is_primary = true WHERE franchisee_id = p_franchisee_id AND territory_id = v_record_id;
                SELECT id, name, state INTO v_territory_rec FROM public.territories WHERE id = v_record_id;
                UPDATE public.franchisees 
                SET territory_id = v_territory_rec.id, territory_city = v_territory_rec.name, territory_state = v_territory_rec.state, updated_at = now()
                WHERE id = p_franchisee_id;
            ELSE
                UPDATE public.franchisees 
                SET territory_id = NULL, territory_city = NULL, territory_state = NULL, updated_at = now()
                WHERE id = p_franchisee_id;
            END IF;
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid action: %', p_action;
    END IF;

    -- Write audit log entry
    v_meta := jsonb_build_object(
        'action', p_action,
        'territory_id', p_territory_id,
        'territory_name', v_territory_rec.name,
        'is_primary', p_is_primary,
        'ownership_type', p_ownership_type,
        'radius_km', p_radius_km,
        'area_name', p_area_name
    );

    INSERT INTO public.audit_logs (
        user_id, action, entity, entity_id, metadata, created_at
    ) VALUES (
        v_user_id,
        'franchisee_territory_allotment_' || p_action,
        'franchisee_territories',
        p_franchisee_id,
        v_meta,
        now()
    );

    RETURN jsonb_build_object('success', true, 'action', p_action, 'franchisee_id', p_franchisee_id);
END;
$$;

-- 7. Data Repair & Backfill for existing franchisees

-- 7.1 MAYUR DEEPAK GANDHI -> Pune (Maharashtra)
DO $$
DECLARE
    v_f_id uuid := '2c469d4d-45cb-421a-bcea-24165f782d1a';
    v_pune_id uuid;
BEGIN
    SELECT id INTO v_pune_id FROM public.territories WHERE lower(name) = 'pune' LIMIT 1;
    IF v_pune_id IS NOT NULL THEN
        -- Insert Pune into franchisee_territories
        INSERT INTO public.franchisee_territories (
            franchisee_id, territory_id, is_primary, ownership_type, exclusivity_radius_km, area_name
        ) VALUES (
            v_f_id, v_pune_id, true, 'FRANCHISE', 5.0, 'Pune'
        ) ON CONFLICT (franchisee_id, territory_id) DO UPDATE SET
            is_primary = true, ownership_type = 'FRANCHISE';

        -- Update franchisee row
        UPDATE public.franchisees
        SET territory_id = v_pune_id,
            territory_city = 'Pune',
            territory_state = 'Maharashtra',
            territory_area = 'Pune',
            territory_country = 'India',
            warehouse_id = NULL
        WHERE id = v_f_id;

        -- Unlink franchisee from central warehouse in warehouses table
        UPDATE public.warehouses
        SET franchisee_id = NULL
        WHERE id = 'fb6df109-a8a8-4b89-9aab-4fbc28fe3d5c';

        -- Repair historical claims for Mayur Deepak Gandhi
        UPDATE public.roi_claims
        SET snapshot = jsonb_set(
            jsonb_set(snapshot::jsonb, '{location}', '"Pune, Maharashtra"'),
            '{territory}', '"Pune"'
        )
        WHERE franchisee_id = v_f_id
          AND (snapshot->>'territory' = 'Udaipur' OR snapshot->>'location' ILIKE '%Udaipur%');
    END IF;
END $$;

-- 7.2 MOHAMMAD WAKEEL -> Jhotwara, Jaipur (Rajasthan)
DO $$
DECLARE
    v_f_id uuid := 'f40bd753-5a21-4b6a-a55f-0073ccf786fc';
    v_jaipur_id uuid;
BEGIN
    SELECT id INTO v_jaipur_id FROM public.territories WHERE lower(name) = 'jaipur' LIMIT 1;
    IF v_jaipur_id IS NOT NULL THEN
        INSERT INTO public.franchisee_territories (
            franchisee_id, territory_id, is_primary, ownership_type, exclusivity_radius_km, area_name
        ) VALUES (
            v_f_id, v_jaipur_id, true, 'FRANCHISE', 5.0, 'Jhotwara'
        ) ON CONFLICT (franchisee_id, territory_id) DO UPDATE SET
            is_primary = true, area_name = 'Jhotwara', ownership_type = 'FRANCHISE';

        UPDATE public.franchisees
        SET territory_id = v_jaipur_id,
            territory_city = 'Jaipur',
            territory_state = 'Rajasthan',
            territory_area = 'Jhotwara',
            territory_country = 'India'
        WHERE id = v_f_id;
    END IF;
END $$;

-- 7.3 Backfill all other existing franchisees with matching territory
INSERT INTO public.franchisee_territories (
    franchisee_id, territory_id, is_primary, ownership_type, exclusivity_radius_km, area_name
)
SELECT 
    f.id,
    COALESCE(f.territory_id, t.id),
    true,
    'FRANCHISE',
    COALESCE(f.territory_radius_km, 5.0),
    COALESCE(f.territory_area, f.territory_city, t.name)
FROM public.franchisees f
JOIN public.territories t 
  ON (f.territory_id = t.id OR lower(trim(f.territory_city)) = lower(trim(t.name)))
WHERE f.id NOT IN ('2c469d4d-45cb-421a-bcea-24165f782d1a', 'f40bd753-5a21-4b6a-a55f-0073ccf786fc')
ON CONFLICT (franchisee_id, territory_id) DO NOTHING;

-- Sync territory_id on franchisees where it was matched by territory_city
UPDATE public.franchisees f
SET territory_id = ft.territory_id,
    territory_city = COALESCE(f.territory_city, t.name),
    territory_state = COALESCE(f.territory_state, t.state)
FROM public.franchisee_territories ft
JOIN public.territories t ON ft.territory_id = t.id
WHERE f.id = ft.franchisee_id 
  AND ft.is_primary = true 
  AND f.territory_id IS NULL;
