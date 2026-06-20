
-- Realtime: restrict channel subscriptions to authenticated staff
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can use realtime" ON realtime.messages;
CREATE POLICY "Staff can use realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

DROP POLICY IF EXISTS "Staff can broadcast realtime" ON realtime.messages;
CREATE POLICY "Staff can broadcast realtime"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));

-- Explicit super_admin SELECT on platform_integrations (in addition to the existing ALL policy)
DROP POLICY IF EXISTS "Super admin reads platform integrations" ON public.platform_integrations;
CREATE POLICY "Super admin reads platform integrations"
  ON public.platform_integrations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
