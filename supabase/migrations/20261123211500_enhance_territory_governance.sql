-- Phase 3 Enhancement: Robust Territory Allotment, Inline Territory Creation & Founder/SuperAdmin Alignment

-- 1. Ensure shivansh1323@gmail.com has super_admin role as well
DO $$
DECLARE
    v_u_id uuid;
BEGIN
    SELECT id INTO v_u_id FROM auth.users WHERE lower(email) = 'shivansh1323@gmail.com' LIMIT 1;
    IF v_u_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_u_id, 'super_admin'::app_role)
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $$;

-- 2. Update RLS policies on territories to allow super_admin and founder to insert/update
DROP POLICY IF EXISTS territories_insert ON public.territories;
CREATE POLICY territories_insert ON public.territories
    FOR INSERT TO authenticated
    WITH CHECK (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR 
        public.has_role(auth.uid(), 'founder'::app_role)
    );

DROP POLICY IF EXISTS territories_update ON public.territories;
CREATE POLICY territories_update ON public.territories
    FOR UPDATE TO authenticated
    USING (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR 
        public.has_role(auth.uid(), 'founder'::app_role)
    )
    WITH CHECK (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR 
        public.has_role(auth.uid(), 'founder'::app_role)
    );

-- 3. Update RLS policies on franchisee_territories to recognize both super_admin and founder
DROP POLICY IF EXISTS franchisee_territories_insert ON public.franchisee_territories;
CREATE POLICY franchisee_territories_insert ON public.franchisee_territories
    FOR INSERT TO authenticated
    WITH CHECK (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR 
        public.has_role(auth.uid(), 'founder'::app_role)
    );

DROP POLICY IF EXISTS franchisee_territories_update ON public.franchisee_territories;
CREATE POLICY franchisee_territories_update ON public.franchisee_territories
    FOR UPDATE TO authenticated
    USING (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR 
        public.has_role(auth.uid(), 'founder'::app_role)
    )
    WITH CHECK (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR 
        public.has_role(auth.uid(), 'founder'::app_role)
    );

DROP POLICY IF EXISTS franchisee_territories_delete ON public.franchisee_territories;
CREATE POLICY franchisee_territories_delete ON public.franchisee_territories
    FOR DELETE TO authenticated
    USING (
        public.has_role(auth.uid(), 'super_admin'::app_role) OR 
        public.has_role(auth.uid(), 'founder'::app_role)
    );

-- 4. Overhaul manage_franchisee_territory RPC
-- Supports: 'add', 'update', 'set_primary', 'delete', inline new territory creation, and territory switching
CREATE OR REPLACE FUNCTION public.manage_franchisee_territory(
    p_action text, -- 'add', 'update', 'delete', 'set_primary', 'create_territory'
    p_franchisee_id uuid,
    p_territory_id uuid DEFAULT NULL,
    p_is_primary boolean DEFAULT true,
    p_ownership_type text DEFAULT 'FRANCHISE',
    p_radius_km numeric DEFAULT 5.0,
    p_area_name text DEFAULT NULL,
    p_effective_from date DEFAULT CURRENT_DATE,
    p_effective_to date DEFAULT NULL,
    p_old_territory_id uuid DEFAULT NULL,
    p_new_territory_name text DEFAULT NULL,
    p_new_territory_state text DEFAULT NULL,
    p_new_territory_region text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_authorized boolean;
    v_target_territory_id uuid := p_territory_id;
    v_territory_rec RECORD;
    v_record_id uuid;
    v_meta jsonb;
BEGIN
    -- Check executive authorization (super_admin or founder)
    SELECT (public.has_role(v_user_id, 'super_admin'::app_role) OR public.has_role(v_user_id, 'founder'::app_role))
    INTO v_is_authorized;

    IF NOT COALESCE(v_is_authorized, false) THEN
        RAISE EXCEPTION 'Forbidden: only super_admin or founder can add, change, or delete franchisee territory allotments';
    END IF;

    -- Inline territory creation if new territory details provided
    IF (v_target_territory_id IS NULL OR p_action = 'create_territory') AND p_new_territory_name IS NOT NULL AND trim(p_new_territory_name) != '' THEN
        SELECT id INTO v_target_territory_id 
        FROM public.territories 
        WHERE lower(trim(name)) = lower(trim(p_new_territory_name)) LIMIT 1;

        IF v_target_territory_id IS NULL THEN
            INSERT INTO public.territories (
                name, state, region, ownership_type
            ) VALUES (
                trim(p_new_territory_name),
                NULLIF(trim(p_new_territory_state), ''),
                COALESCE(NULLIF(trim(p_new_territory_region), ''), 'North'),
                COALESCE(p_ownership_type, 'FRANCHISE')
            ) RETURNING id INTO v_target_territory_id;
        END IF;

        IF p_action = 'create_territory' THEN
            SELECT id, name, state, ownership_type INTO v_territory_rec FROM public.territories WHERE id = v_target_territory_id;
            RETURN jsonb_build_object(
                'success', true, 
                'action', 'create_territory', 
                'territory_id', v_target_territory_id,
                'name', v_territory_rec.name,
                'state', v_territory_rec.state,
                'ownership_type', v_territory_rec.ownership_type
            );
        END IF;
    END IF;

    IF v_target_territory_id IS NULL AND p_action != 'delete' THEN
        RAISE EXCEPTION 'Territory ID or valid territory name is required';
    END IF;

    -- Fetch territory record
    IF v_target_territory_id IS NOT NULL THEN
        SELECT id, name, state, ownership_type INTO v_territory_rec 
        FROM public.territories 
        WHERE id = v_target_territory_id;

        IF v_territory_rec.id IS NULL AND p_action != 'delete' THEN
            RAISE EXCEPTION 'Territory % not found in database', v_target_territory_id;
        END IF;
    END IF;

    -- ACTION: ADD
    IF p_action = 'add' THEN
        IF p_is_primary THEN
            UPDATE public.franchisee_territories 
            SET is_primary = false, updated_at = now() 
            WHERE franchisee_id = p_franchisee_id;
        END IF;

        INSERT INTO public.franchisee_territories (
            franchisee_id, territory_id, is_primary, ownership_type,
            exclusivity_radius_km, area_name, effective_from, effective_to, created_by
        ) VALUES (
            p_franchisee_id, v_target_territory_id, p_is_primary, p_ownership_type,
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

    -- ACTION: UPDATE / CHANGE
    ELSIF p_action = 'update' THEN
        -- If switching from an old territory to a different new territory
        IF p_old_territory_id IS NOT NULL AND p_old_territory_id != v_target_territory_id THEN
            DELETE FROM public.franchisee_territories 
            WHERE franchisee_id = p_franchisee_id AND territory_id = p_old_territory_id;
        END IF;

        IF p_is_primary THEN
            UPDATE public.franchisee_territories 
            SET is_primary = false, updated_at = now() 
            WHERE franchisee_id = p_franchisee_id AND territory_id != v_target_territory_id;
        END IF;

        INSERT INTO public.franchisee_territories (
            franchisee_id, territory_id, is_primary, ownership_type,
            exclusivity_radius_km, area_name, effective_from, effective_to, created_by
        ) VALUES (
            p_franchisee_id, v_target_territory_id, p_is_primary, p_ownership_type,
            p_radius_km, p_area_name, p_effective_from, p_effective_to, v_user_id
        )
        ON CONFLICT (franchisee_id, territory_id) DO UPDATE SET
            is_primary = EXCLUDED.is_primary,
            ownership_type = EXCLUDED.ownership_type,
            exclusivity_radius_km = EXCLUDED.exclusivity_radius_km,
            area_name = p_area_name,
            effective_from = p_effective_from,
            effective_to = p_effective_to,
            updated_at = now()
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

    -- ACTION: SET PRIMARY
    ELSIF p_action = 'set_primary' THEN
        UPDATE public.franchisee_territories 
        SET is_primary = false, updated_at = now() 
        WHERE franchisee_id = p_franchisee_id;

        UPDATE public.franchisee_territories 
        SET is_primary = true, updated_at = now() 
        WHERE franchisee_id = p_franchisee_id AND territory_id = v_target_territory_id
        RETURNING id INTO v_record_id;

        UPDATE public.franchisees
        SET territory_id = v_territory_rec.id,
            territory_city = v_territory_rec.name,
            territory_state = v_territory_rec.state,
            territory_area = COALESCE(v_territory_rec.name, territory_area),
            warehouse_id = CASE WHEN warehouse_id = 'fb6df109-a8a8-4b89-9aab-4fbc28fe3d5c' THEN NULL ELSE warehouse_id END,
            updated_at = now()
        WHERE id = p_franchisee_id;

    -- ACTION: DELETE
    ELSIF p_action = 'delete' THEN
        DELETE FROM public.franchisee_territories
        WHERE franchisee_id = p_franchisee_id AND territory_id = v_target_territory_id;

        IF EXISTS (SELECT 1 FROM public.franchisees WHERE id = p_franchisee_id AND territory_id = v_target_territory_id) THEN
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

    -- Audit log
    v_meta := jsonb_build_object(
        'action', p_action,
        'territory_id', v_target_territory_id,
        'territory_name', v_territory_rec.name,
        'is_primary', p_is_primary,
        'ownership_type', p_ownership_type,
        'radius_km', p_radius_km,
        'area_name', p_area_name,
        'old_territory_id', p_old_territory_id
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

    RETURN jsonb_build_object(
        'success', true, 
        'action', p_action, 
        'franchisee_id', p_franchisee_id,
        'territory_id', v_target_territory_id
    );
END;
$$;
