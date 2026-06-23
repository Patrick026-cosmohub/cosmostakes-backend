ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bonus_balance_type text,
  ADD COLUMN IF NOT EXISTS bonus_balance_value numeric,
  ADD COLUMN IF NOT EXISTS bonus_balance_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_bonus_type text,
  ADD COLUMN IF NOT EXISTS pending_bonus_value numeric,
  ADD COLUMN IF NOT EXISTS pending_bonus_cash numeric NOT NULL DEFAULT 0;

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
    IF NEW.gold_coins IS DISTINCT FROM OLD.gold_coins
    OR NEW.sweeps_coins IS DISTINCT FROM OLD.sweeps_coins
    OR NEW.bonus_credits IS DISTINCT FROM OLD.bonus_credits
    OR NEW.bonus_balance_type IS DISTINCT FROM OLD.bonus_balance_type
    OR NEW.bonus_balance_value IS DISTINCT FROM OLD.bonus_balance_value
    OR NEW.bonus_balance_expires_at IS DISTINCT FROM OLD.bonus_balance_expires_at
    OR NEW.pending_bonus_type IS DISTINCT FROM OLD.pending_bonus_type
    OR NEW.pending_bonus_value IS DISTINCT FROM OLD.pending_bonus_value
    OR NEW.pending_bonus_cash IS DISTINCT FROM OLD.pending_bonus_cash THEN
      RAISE EXCEPTION 'Financial fields can only be modified by server-side logic';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_profile_bonus_with_conflict(
  p_user_id uuid,
  p_bonus_type text,
  p_value numeric,
  p_reason text,
  p_staff_id uuid DEFAULT NULL
)
RETURNS TABLE(
  bonus_balance_type text,
  bonus_balance_value numeric,
  bonus_balance_expires_at timestamptz,
  pending_bonus_type text,
  pending_bonus_value numeric,
  pending_bonus_cash numeric,
  sweeps_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles%ROWTYPE;
  expires_at timestamptz;
  slot_active boolean;
  next_sweeps numeric;
BEGIN
  IF p_bonus_type NOT IN ('cash', 'coupon', 'freeplay') THEN
    RAISE EXCEPTION 'Invalid bonus type';
  END IF;
  IF p_value <= 0 THEN
    RAISE EXCEPTION 'Bonus value must be positive';
  END IF;

  SELECT * INTO profile_row
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player profile not found';
  END IF;

  expires_at := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 day' - interval '1 second';
  slot_active := profile_row.bonus_balance_type IS NOT NULL
    AND profile_row.bonus_balance_expires_at IS NOT NULL
    AND profile_row.bonus_balance_expires_at > now();

  PERFORM set_config('app.allow_profile_financial_update', 'true', true);

  IF p_bonus_type IN ('cash', 'freeplay') THEN
    next_sweeps := round(coalesce(profile_row.sweeps_coins, 0) + p_value, 2);

    UPDATE public.profiles
    SET
      sweeps_coins = next_sweeps,
      pending_bonus_cash = round(coalesce(pending_bonus_cash, 0) + p_value, 2),
      bonus_balance_type = CASE WHEN slot_active THEN bonus_balance_type ELSE p_bonus_type END,
      bonus_balance_value = CASE WHEN slot_active THEN bonus_balance_value ELSE p_value END,
      bonus_balance_expires_at = CASE WHEN slot_active THEN bonus_balance_expires_at ELSE expires_at END
    WHERE id = p_user_id
    RETURNING * INTO profile_row;

    INSERT INTO public.wallet_transactions (user_id, currency, amount, reason, balance_after, metadata)
    VALUES (
      p_user_id,
      'sweeps',
      p_value,
      'bonus',
      next_sweeps,
      jsonb_build_object(
        'staff_id', p_staff_id,
        'reason', p_reason,
        'bonus_type', p_bonus_type,
        'previous_balance', profile_row.sweeps_coins - p_value
      )
    );
  ELSE
    IF slot_active THEN
      UPDATE public.profiles
      SET pending_bonus_type = 'coupon',
          pending_bonus_value = p_value
      WHERE id = p_user_id
      RETURNING * INTO profile_row;
    ELSE
      UPDATE public.profiles
      SET bonus_balance_type = 'coupon',
          bonus_balance_value = p_value,
          bonus_balance_expires_at = expires_at,
          pending_bonus_type = NULL,
          pending_bonus_value = NULL
      WHERE id = p_user_id
      RETURNING * INTO profile_row;
    END IF;

    INSERT INTO public.wallet_transactions (user_id, currency, amount, reason, balance_after, metadata)
    VALUES (
      p_user_id,
      'bonus',
      0,
      'bonus',
      coalesce(profile_row.sweeps_coins, 0),
      jsonb_build_object('staff_id', p_staff_id, 'reason', p_reason, 'bonus_type', 'coupon', 'coupon_percent', p_value)
    );
  END IF;

  RETURN QUERY SELECT
    profile_row.bonus_balance_type,
    profile_row.bonus_balance_value,
    profile_row.bonus_balance_expires_at,
    profile_row.pending_bonus_type,
    profile_row.pending_bonus_value,
    profile_row.pending_bonus_cash,
    profile_row.sweeps_coins;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_profile_coupon_bonus(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_profile_financial_update', 'true', true);

  UPDATE public.profiles
  SET bonus_balance_type = NULL,
      bonus_balance_value = NULL,
      bonus_balance_expires_at = NULL
  WHERE id = p_user_id
    AND bonus_balance_type = 'coupon';
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_profile_bonus_cash(
  p_user_id uuid,
  p_amount numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_pending numeric;
BEGIN
  IF p_amount <= 0 THEN
    RETURN 0;
  END IF;

  PERFORM set_config('app.allow_profile_financial_update', 'true', true);

  UPDATE public.profiles
  SET pending_bonus_cash = greatest(0, round(coalesce(pending_bonus_cash, 0) - p_amount, 2)),
      bonus_balance_type = CASE
        WHEN bonus_balance_type IN ('cash', 'freeplay') AND greatest(0, round(coalesce(pending_bonus_cash, 0) - p_amount, 2)) = 0
          THEN NULL
        ELSE bonus_balance_type
      END,
      bonus_balance_value = CASE
        WHEN bonus_balance_type IN ('cash', 'freeplay') AND greatest(0, round(coalesce(pending_bonus_cash, 0) - p_amount, 2)) = 0
          THEN NULL
        ELSE bonus_balance_value
      END,
      bonus_balance_expires_at = CASE
        WHEN bonus_balance_type IN ('cash', 'freeplay') AND greatest(0, round(coalesce(pending_bonus_cash, 0) - p_amount, 2)) = 0
          THEN NULL
        ELSE bonus_balance_expires_at
      END
  WHERE id = p_user_id
  RETURNING pending_bonus_cash INTO next_pending;

  RETURN coalesce(next_pending, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.credit_profile_bonus_with_conflict(uuid, text, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_profile_coupon_bonus(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_profile_bonus_cash(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_profile_bonus_with_conflict(uuid, text, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_profile_coupon_bonus(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_profile_bonus_cash(uuid, numeric) TO service_role;
