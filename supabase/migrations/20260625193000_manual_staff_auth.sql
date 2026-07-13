-- Manual admin staff auth: staff are managed inside staff_profiles instead of Supabase Auth.
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_sessions_staff_idx ON public.admin_sessions(staff_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON public.admin_sessions(expires_at);

GRANT ALL ON public.admin_sessions TO service_role;

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No client access to admin sessions" ON public.admin_sessions;
CREATE POLICY "No client access to admin sessions"
  ON public.admin_sessions FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Let manually-created staff IDs exist without corresponding auth.users rows.
ALTER TABLE public.staff_profiles DROP CONSTRAINT IF EXISTS staff_profiles_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.deposit_requests DROP CONSTRAINT IF EXISTS deposit_requests_processed_by_fkey;
ALTER TABLE public.cashout_requests DROP CONSTRAINT IF EXISTS cashout_requests_processed_by_fkey;
ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_staff_id_fkey;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_staff_id_fkey;
ALTER TABLE public.bonuses DROP CONSTRAINT IF EXISTS bonuses_created_by_fkey;
ALTER TABLE public.site_theme DROP CONSTRAINT IF EXISTS site_theme_updated_by_fkey;
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_assigned_staff_id_fkey;

