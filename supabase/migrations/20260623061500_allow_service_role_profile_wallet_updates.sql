-- Supabase PostgREST connects through the authenticator DB role, so current_user
-- is not a reliable way to identify service-role requests inside triggers.
-- Use the request JWT role claim instead.
CREATE OR REPLACE FUNCTION public.prevent_profile_financial_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_role text;
BEGIN
  request_role := nullif(current_setting('request.jwt.claim.role', true), '');

  IF coalesce(request_role, '') <> 'service_role' THEN
    IF NEW.gold_coins   IS DISTINCT FROM OLD.gold_coins
    OR NEW.sweeps_coins IS DISTINCT FROM OLD.sweeps_coins
    OR NEW.bonus_credits IS DISTINCT FROM OLD.bonus_credits THEN
      RAISE EXCEPTION 'Financial fields can only be modified by server-side logic';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
