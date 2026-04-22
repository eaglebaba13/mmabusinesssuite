DROP POLICY IF EXISTS "notif insert" ON public.notifications;
CREATE POLICY "notif insert self" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);