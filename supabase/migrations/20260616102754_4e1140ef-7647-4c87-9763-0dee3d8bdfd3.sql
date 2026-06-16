
-- ============ EXTEND EXISTING TABLES ============

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS vip_tier_id UUID,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_style JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_frequency_seconds INT NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS display_title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS prev_value JSONB,
  ADD COLUMN IF NOT EXISTS new_value JSONB,
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- ============ BONUSES ============
CREATE TABLE IF NOT EXISTS public.bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('welcome','referral','reload','cashback','seasonal')),
  description TEXT,
  percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  min_deposit NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_bonus NUMERIC(14,2) NOT NULL DEFAULT 0,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonuses TO authenticated;
GRANT ALL ON public.bonuses TO service_role;
ALTER TABLE public.bonuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read bonuses" ON public.bonuses FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin manages bonuses" ON public.bonuses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER bonuses_updated BEFORE UPDATE ON public.bonuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.bonus_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_id UUID NOT NULL REFERENCES public.bonuses(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.bonus_claims TO authenticated;
GRANT ALL ON public.bonus_claims TO service_role;
ALTER TABLE public.bonus_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read bonus claims" ON public.bonus_claims FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Staff insert bonus claims" ON public.bonus_claims FOR INSERT TO authenticated WITH CHECK (has_any_staff_role(auth.uid()));

-- ============ VIP TIERS ============
CREATE TABLE IF NOT EXISTS public.vip_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT NOT NULL DEFAULT '#888888',
  deposit_required NUMERIC(14,2) NOT NULL DEFAULT 0,
  monthly_activity_required NUMERIC(14,2) NOT NULL DEFAULT 0,
  cashback_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  perks JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority_support BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_tiers TO authenticated;
GRANT ALL ON public.vip_tiers TO service_role;
ALTER TABLE public.vip_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read vip" ON public.vip_tiers FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin manages vip" ON public.vip_tiers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER vip_tiers_updated BEFORE UPDATE ON public.vip_tiers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.players
  ADD CONSTRAINT players_vip_tier_fk FOREIGN KEY (vip_tier_id) REFERENCES public.vip_tiers(id) ON DELETE SET NULL;

-- ============ ANNOUNCEMENTS ============
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  pinned BOOLEAN NOT NULL DEFAULT false,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read announcements" ON public.announcements FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin manages announcements" ON public.announcements FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER announcements_updated BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ SITE THEME (singleton) ============
CREATE TABLE IF NOT EXISTS public.site_theme (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'dark' CHECK (mode IN ('light','dark')),
  primary_color TEXT NOT NULL DEFAULT '#6366F1',
  accent_color TEXT NOT NULL DEFAULT '#22D3EE',
  background_image TEXT,
  banner_image TEXT,
  logo_url TEXT,
  widgets JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE ON public.site_theme TO authenticated;
GRANT ALL ON public.site_theme TO service_role;
ALTER TABLE public.site_theme ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read theme" ON public.site_theme FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin manages theme" ON public.site_theme FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
INSERT INTO public.site_theme (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============ MUSIC ============
CREATE TABLE IF NOT EXISTS public.music_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT false,
  autoplay BOOLEAN NOT NULL DEFAULT false,
  default_volume NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.music_settings TO authenticated;
GRANT ALL ON public.music_settings TO service_role;
ALTER TABLE public.music_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read music settings" ON public.music_settings FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin manages music settings" ON public.music_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
INSERT INTO public.music_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.music_tracks TO authenticated;
GRANT ALL ON public.music_tracks TO service_role;
ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read music tracks" ON public.music_tracks FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin manages music tracks" ON public.music_tracks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- ============ NOTIFICATION SETTINGS ============
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  from_email TEXT,
  from_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read notif settings" ON public.notification_settings FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin manages notif settings" ON public.notification_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
INSERT INTO public.notification_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============ SECURITY SETTINGS ============
CREATE TABLE IF NOT EXISTS public.security_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_password_length INT NOT NULL DEFAULT 12,
  require_uppercase BOOLEAN NOT NULL DEFAULT true,
  require_number BOOLEAN NOT NULL DEFAULT true,
  require_symbol BOOLEAN NOT NULL DEFAULT true,
  session_timeout_minutes INT NOT NULL DEFAULT 60,
  enforce_2fa_super_admin BOOLEAN NOT NULL DEFAULT false,
  ip_whitelist JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.security_settings TO authenticated;
GRANT ALL ON public.security_settings TO service_role;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read security settings" ON public.security_settings FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin manages security settings" ON public.security_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));
INSERT INTO public.security_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============ PLAYER LOGINS ============
CREATE TABLE IF NOT EXISTS public.player_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.player_logins TO authenticated;
GRANT ALL ON public.player_logins TO service_role;
ALTER TABLE public.player_logins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read player logins" ON public.player_logins FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Staff insert player logins" ON public.player_logins FOR INSERT TO authenticated WITH CHECK (has_any_staff_role(auth.uid()));
CREATE INDEX IF NOT EXISTS player_logins_player_idx ON public.player_logins(player_id, created_at DESC);

-- ============ PLATFORM SYNC LOGS ============
CREATE TABLE IF NOT EXISTS public.platform_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  message TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.platform_sync_logs TO authenticated;
GRANT ALL ON public.platform_sync_logs TO service_role;
ALTER TABLE public.platform_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read sync logs" ON public.platform_sync_logs FOR SELECT TO authenticated USING (has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin insert sync logs" ON public.platform_sync_logs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- ============ AUDIT LOG IMMUTABILITY ============
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON public.audit_logs FROM anon;
