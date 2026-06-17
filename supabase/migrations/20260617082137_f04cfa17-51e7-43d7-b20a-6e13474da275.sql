-- Restrict platform_players (contains juwa_password) to super_admin + admin only
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_players TO authenticated;
GRANT ALL ON public.platform_players TO service_role;

ALTER TABLE public.platform_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin and admin read platform players" ON public.platform_players;
CREATE POLICY "Super admin and admin read platform players"
ON public.platform_players FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Super admin and admin write platform players" ON public.platform_players;
CREATE POLICY "Super admin and admin write platform players"
ON public.platform_players FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));