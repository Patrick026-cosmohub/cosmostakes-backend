CREATE OR REPLACE FUNCTION public.prevent_profile_financial_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_role text;
  internal_allowed boolean;
BEGIN
  request_role := nullif(current_setting('request.jwt.claim.role', true), '');
  internal_allowed := coalesce(current_setting('app.allow_profile_financial_update', true), '') = 'true';

  IF NOT internal_allowed AND coalesce(request_role, '') <> 'service_role' THEN
    IF NEW.gold_coins   IS DISTINCT FROM OLD.gold_coins
    OR NEW.sweeps_coins IS DISTINCT FROM OLD.sweeps_coins
    OR NEW.bonus_credits IS DISTINCT FROM OLD.bonus_credits THEN
      RAISE EXCEPTION 'Financial fields can only be modified by server-side logic';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_profile_wallet(
  p_user_id uuid,
  p_currency text,
  p_delta numeric,
  p_reason text,
  p_staff_id uuid
)
RETURNS TABLE(balance numeric, currency text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance numeric;
  next_balance numeric;
  tx_reason text;
BEGIN
  IF p_currency NOT IN ('sweeps', 'gold') THEN
    RAISE EXCEPTION 'Invalid currency';
  END IF;
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'Amount must be non-zero';
  END IF;

  IF p_currency = 'gold' THEN
    SELECT gold_coins INTO current_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;
  ELSE
    SELECT sweeps_coins INTO current_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;
  END IF;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Player profile not found';
  END IF;

  next_balance := round(current_balance + p_delta, 2);
  IF next_balance < 0 THEN
    RAISE EXCEPTION 'Adjustment would result in negative balance';
  END IF;

  PERFORM set_config('app.allow_profile_financial_update', 'true', true);

  IF p_currency = 'gold' THEN
    UPDATE public.profiles
    SET gold_coins = next_balance
    WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
    SET sweeps_coins = next_balance
    WHERE id = p_user_id;
  END IF;

  tx_reason := CASE WHEN p_delta >= 0 THEN 'admin_manual_credit' ELSE 'admin_manual_debit' END;

  INSERT INTO public.wallet_transactions (user_id, currency, amount, reason, balance_after, metadata)
  VALUES (
    p_user_id,
    p_currency,
    p_delta,
    tx_reason,
    next_balance,
    jsonb_build_object(
      'staff_id', p_staff_id,
      'reason', p_reason,
      'previous_balance', current_balance
    )
  );

  RETURN QUERY SELECT next_balance, p_currency;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_profile_wallet(uuid, text, numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_profile_wallet(uuid, text, numeric, text, uuid) TO service_role;
