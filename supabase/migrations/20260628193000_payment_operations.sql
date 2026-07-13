CREATE TABLE IF NOT EXISTS public.public_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('cspay', 'zappay')),
  provider_order_id text NOT NULL UNIQUE,
  provider_payment_id text,
  player_name text NOT NULL CHECK (char_length(trim(player_name)) > 0),
  game_username text NOT NULL CHECK (char_length(trim(game_username)) > 0),
  amount_usd numeric(14,2) NOT NULL CHECK (amount_usd > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  pay_way text,
  pay_url text,
  provider_status text NOT NULL DEFAULT 'creating'
    CHECK (provider_status IN ('creating', 'pending', 'paid', 'completed', 'failed', 'expired', 'amount_mismatch')),
  admin_status text NOT NULL DEFAULT 'pending'
    CHECK (admin_status IN ('pending', 'verified', 'rejected')),
  wallet_credited boolean NOT NULL DEFAULT false,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  internal_note text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

DROP TRIGGER IF EXISTS public_payment_requests_updated ON public.public_payment_requests;
CREATE TRIGGER public_payment_requests_updated
  BEFORE UPDATE ON public.public_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS public_payment_requests_status_idx
  ON public.public_payment_requests(admin_status, provider_status, created_at DESC);

CREATE INDEX IF NOT EXISTS public_payment_requests_provider_idx
  ON public.public_payment_requests(provider, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.public_payment_requests TO authenticated;
GRANT ALL ON public.public_payment_requests TO service_role;
ALTER TABLE public.public_payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read public payment requests" ON public.public_payment_requests;
CREATE POLICY "Staff read public payment requests"
  ON public.public_payment_requests FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

DROP POLICY IF EXISTS "Finance updates public payment requests" ON public.public_payment_requests;
CREATE POLICY "Finance updates public payment requests"
  ON public.public_payment_requests FOR UPDATE TO authenticated
  USING (
    public.can_handle_finance(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL CHECK (char_length(trim(player_name)) > 0),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method_name text,
  recipient_details text NOT NULL CHECK (char_length(trim(recipient_details)) > 0),
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_by uuid,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS payout_requests_updated ON public.payout_requests;
CREATE TRIGGER payout_requests_updated
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS payout_requests_status_idx
  ON public.payout_requests(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read payout requests" ON public.payout_requests;
CREATE POLICY "Staff read payout requests"
  ON public.payout_requests FOR SELECT TO authenticated
  USING (public.has_any_staff_role(auth.uid()));

DROP POLICY IF EXISTS "Finance insert payout requests" ON public.payout_requests;
CREATE POLICY "Finance insert payout requests"
  ON public.payout_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.can_handle_finance(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Finance update payout requests" ON public.payout_requests;
CREATE POLICY "Finance update payout requests"
  ON public.payout_requests FOR UPDATE TO authenticated
  USING (
    public.can_handle_finance(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );
