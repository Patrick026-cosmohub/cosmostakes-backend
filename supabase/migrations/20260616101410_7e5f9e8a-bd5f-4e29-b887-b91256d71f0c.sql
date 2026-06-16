
-- General settings (singleton)
CREATE TABLE public.general_settings (
  id boolean PRIMARY KEY DEFAULT true,
  platform_name text NOT NULL DEFAULT 'Cosmo Stakes',
  company_logo_url text,
  support_email text,
  support_phone text,
  timezone text NOT NULL DEFAULT 'America/New_York',
  currency text NOT NULL DEFAULT 'USD',
  date_format text NOT NULL DEFAULT 'MM/DD/YYYY',
  time_format text NOT NULL DEFAULT '12h',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT general_settings_singleton CHECK (id = true)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.general_settings TO authenticated;
GRANT ALL ON public.general_settings TO service_role;

ALTER TABLE public.general_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read general settings" ON public.general_settings
  FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

CREATE POLICY "Super admin manages general settings" ON public.general_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER general_settings_set_updated_at
  BEFORE UPDATE ON public.general_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.general_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Platform integrations (one per game)
CREATE TABLE public.platform_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL UNIQUE REFERENCES public.games(id) ON DELETE CASCADE,
  api_endpoint text,
  api_key text,
  secret_key text,
  webhook_url text,
  connection_status text NOT NULL DEFAULT 'not_configured',
  last_synced_at timestamptz,
  last_test_at timestamptz,
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_integrations TO authenticated;
GRANT ALL ON public.platform_integrations TO service_role;

ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages integrations" ON public.platform_integrations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER platform_integrations_set_updated_at
  BEFORE UPDATE ON public.platform_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed integration rows for active platforms
INSERT INTO public.platform_integrations (game_id)
SELECT id FROM public.games WHERE is_active = true
ON CONFLICT (game_id) DO NOTHING;
