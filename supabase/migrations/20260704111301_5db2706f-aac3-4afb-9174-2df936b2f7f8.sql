-- Add active flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Replace list function to include is_active
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(id uuid, email text, full_name text, phone text, created_at timestamptz, is_active boolean, roles app_role[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'founder')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.phone, p.created_at, p.is_active,
           COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}'::app_role[])
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC;
END$function$;

-- Toggle active status
CREATE OR REPLACE FUNCTION public.admin_set_user_active(_user_id uuid, _active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'founder')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _user_id = auth.uid() AND _active = false THEN
    RAISE EXCEPTION 'Cannot deactivate your own account';
  END IF;
  IF _active = false AND public.has_role(_user_id, 'super_admin') AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only super admins can deactivate a super admin';
  END IF;
  UPDATE public.profiles SET is_active = _active, updated_at = now() WHERE id = _user_id;
  -- Ban / unban at auth layer so they can't sign in
  IF _active = false THEN
    UPDATE auth.users SET banned_until = 'infinity'::timestamptz WHERE id = _user_id;
  ELSE
    UPDATE auth.users SET banned_until = NULL WHERE id = _user_id;
  END IF;
END$function$;

-- Delete user (hard delete auth.users which cascades to profile)
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'founder')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  IF public.has_role(_user_id, 'super_admin') AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only super admins can delete a super admin';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
END$function$;