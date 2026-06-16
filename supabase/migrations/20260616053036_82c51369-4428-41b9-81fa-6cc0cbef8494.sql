
-- Enums
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','finance_agent','support_agent');
CREATE TYPE public.request_status AS ENUM ('pending','approved','rejected','failed','uncertain');
CREATE TYPE public.ledger_type AS ENUM ('deposit','cashout','manual_credit','manual_debit','adjustment','bonus');
CREATE TYPE public.player_status AS ENUM ('active','suspended','blocked','pending_kyc');

-- Updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Staff profiles (mirrors auth.users for staff)
CREATE TABLE public.staff_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER staff_profiles_updated BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role (security definer to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_staff_role(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.can_handle_finance(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin','finance_agent')
  )
$$;

-- Staff profile policies
CREATE POLICY "Staff can view all staff profiles" ON public.staff_profiles
  FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.staff_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Super admin can update any profile" ON public.staff_profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'super_admin'));

-- User roles policies
CREATE POLICY "Staff can view roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Super admin manages roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Bootstrap trigger: create staff_profile on signup; first user becomes super_admin
CREATE OR REPLACE FUNCTION public.handle_new_staff_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  staff_count INT;
BEGIN
  INSERT INTO public.staff_profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO staff_count FROM public.user_roles WHERE role = 'super_admin';
  IF staff_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_staff_user();

-- Players
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  game_id TEXT,
  status public.player_status NOT NULL DEFAULT 'active',
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER players_updated BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX players_username_idx ON public.players(username);
CREATE INDEX players_phone_idx ON public.players(phone);
CREATE INDEX players_game_id_idx ON public.players(game_id);
CREATE POLICY "Staff read players" ON public.players FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff insert players" ON public.players FOR INSERT TO authenticated WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff update players" ON public.players FOR UPDATE TO authenticated USING (public.has_any_staff_role(auth.uid()));

-- Payment methods
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  details TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read methods" ON public.payment_methods FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin manages methods" ON public.payment_methods FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Games / providers
CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read games" ON public.games FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Super admin manages games" ON public.games FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Deposit requests
CREATE TABLE public.deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method_id UUID REFERENCES public.payment_methods(id),
  reference TEXT,
  status public.request_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.deposit_requests TO authenticated;
GRANT ALL ON public.deposit_requests TO service_role;
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER deposit_requests_updated BEFORE UPDATE ON public.deposit_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX deposit_status_idx ON public.deposit_requests(status, requested_at DESC);
CREATE POLICY "Staff read deposits" ON public.deposit_requests FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff insert deposits" ON public.deposit_requests FOR INSERT TO authenticated WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Finance updates deposits" ON public.deposit_requests FOR UPDATE TO authenticated USING (public.can_handle_finance(auth.uid()));

-- Cashout requests
CREATE TABLE public.cashout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method_id UUID REFERENCES public.payment_methods(id),
  destination TEXT,
  status public.request_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cashout_requests TO authenticated;
GRANT ALL ON public.cashout_requests TO service_role;
ALTER TABLE public.cashout_requests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER cashout_requests_updated BEFORE UPDATE ON public.cashout_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX cashout_status_idx ON public.cashout_requests(status, requested_at DESC);
CREATE POLICY "Staff read cashouts" ON public.cashout_requests FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff insert cashouts" ON public.cashout_requests FOR INSERT TO authenticated WITH CHECK (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Finance updates cashouts" ON public.cashout_requests FOR UPDATE TO authenticated USING (public.can_handle_finance(auth.uid()));

-- Wallet ledger (immutable record)
CREATE TABLE public.wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  type public.ledger_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  staff_id UUID REFERENCES auth.users(id),
  related_deposit UUID REFERENCES public.deposit_requests(id),
  related_cashout UUID REFERENCES public.cashout_requests(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.wallet_ledger TO authenticated;
GRANT ALL ON public.wallet_ledger TO service_role;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX ledger_player_idx ON public.wallet_ledger(player_id, created_at DESC);
CREATE POLICY "Staff read ledger" ON public.wallet_ledger FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Finance writes ledger" ON public.wallet_ledger FOR INSERT TO authenticated WITH CHECK (public.can_handle_finance(auth.uid()));

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX audit_created_idx ON public.audit_logs(created_at DESC);
CREATE POLICY "Staff read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));
CREATE POLICY "Staff write audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = staff_id);

-- Seed payment methods + games
INSERT INTO public.payment_methods (name, kind, details, is_active) VALUES
  ('Bitcoin','crypto','BTC mainnet',true),
  ('USDT TRC20','crypto','Tether on Tron',true),
  ('CashApp','p2p','$cashtag',true),
  ('Bank Transfer','bank','ACH / wire',true);

INSERT INTO public.games (name, provider, is_active) VALUES
  ('Cosmic Slots','Mock Provider',true),
  ('Stellar Poker','Mock Provider',true),
  ('Galaxy Blackjack','Mock Provider',true),
  ('Nebula Roulette','Mock Provider',true),
  ('Asteroid Dice','Mock Provider',true);
