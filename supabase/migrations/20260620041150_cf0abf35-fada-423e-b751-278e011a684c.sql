
-- 1) platform_credentials: super_admin only
CREATE POLICY "Super admin reads platform credentials"
  ON public.platform_credentials FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin writes platform credentials"
  ON public.platform_credentials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 2) platform_transactions: scoped reads, no client writes (service_role bypasses RLS)
CREATE POLICY "Staff read platform transactions"
  ON public.platform_transactions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance_agent')
  );

-- 3) platform_players: restrict reads to super_admin only (contains plaintext juwa_password)
DROP POLICY IF EXISTS "Super admin and admin read platform players" ON public.platform_players;
CREATE POLICY "Super admin reads platform players"
  ON public.platform_players FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 4) audit_logs: require staff role on insert
DROP POLICY IF EXISTS "Staff write audit" ON public.audit_logs;
CREATE POLICY "Staff write audit"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = staff_id
    AND public.has_any_staff_role(auth.uid())
  );

-- 5) Lock down SECURITY DEFINER functions exposed to anon
REVOKE EXECUTE ON FUNCTION public.handle_new_staff_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_ticket(uuid, uuid) FROM PUBLIC, anon;
