
-- Note: existing public.platform_integrations is keyed by game_id and is used elsewhere.
-- Creating a new table platform_credentials for the Juwa-style proxy credentials
-- to avoid breaking existing code.

CREATE TABLE IF NOT EXISTS public.platform_credentials (
  platform text PRIMARY KEY,
  base_url text NOT NULL,
  agent_id text NOT NULL,
  secret_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.platform_credentials TO service_role;
ALTER TABLE public.platform_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.platform_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_user_id uuid NOT NULL,
  platform text NOT NULL,
  juwa_user_id text NOT NULL,
  juwa_username text NOT NULL,
  juwa_password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_user_id, platform)
);
GRANT ALL ON public.platform_players TO service_role;
ALTER TABLE public.platform_players ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.platform_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_user_id uuid NOT NULL,
  platform text NOT NULL,
  type text NOT NULL CHECK (type IN ('recharge','withdraw')),
  amount numeric NOT NULL,
  order_id text NOT NULL UNIQUE,
  juwa_transaction_id text,
  user_balance numeric,
  status text NOT NULL DEFAULT 'success',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.platform_transactions TO service_role;
ALTER TABLE public.platform_transactions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER platform_credentials_set_updated_at
  BEFORE UPDATE ON public.platform_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
