-- Admin security hardening: policy controls, lockout tracking, and session IP logging.
ALTER TABLE public.security_settings
  ADD COLUMN IF NOT EXISTS max_login_attempts int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS lockout_minutes int NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS password_rotation_days int NOT NULL DEFAULT 0;

ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS failed_login_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

ALTER TABLE public.admin_sessions
  ADD COLUMN IF NOT EXISTS ip_address text;

CREATE INDEX IF NOT EXISTS staff_profiles_locked_until_idx
  ON public.staff_profiles(locked_until)
  WHERE locked_until IS NOT NULL;
