-- 1. Promote remedystore01@gmail.com to super_admin (idempotent)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role FROM auth.users
WHERE email = 'remedystore01@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Admin RPCs (SECURITY DEFINER, gated by admin role check)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, email text, full_name text, phone text,
              created_at timestamptz, roles app_role[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'founder')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.phone, p.created_at,
           COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}'::app_role[])
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC;
END$$;

CREATE OR REPLACE FUNCTION public.admin_grant_role(_user_id uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'founder')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role)
  ON CONFLICT DO NOTHING;
END$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_role(_user_id uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'founder')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _user_id = auth.uid() AND _role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot revoke your own super_admin role';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
END$$;