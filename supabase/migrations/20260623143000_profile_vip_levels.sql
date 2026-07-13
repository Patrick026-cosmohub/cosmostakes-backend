ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_real_spend numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_real_spend numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_spend_reset_at date,
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS priority_cashout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_milestones_hit numeric[] NOT NULL DEFAULT '{}'::numeric[];

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
    OR NEW.pending_bonus_cash IS DISTINCT FROM OLD.pending_bonus_cash
    OR NEW.total_real_spend IS DISTINCT FROM OLD.total_real_spend
    OR NEW.monthly_real_spend IS DISTINCT FROM OLD.monthly_real_spend
    OR NEW.monthly_spend_reset_at IS DISTINCT FROM OLD.monthly_spend_reset_at
    OR NEW.level IS DISTINCT FROM OLD.level
    OR NEW.priority_cashout IS DISTINCT FROM OLD.priority_cashout
    OR NEW.monthly_milestones_hit IS DISTINCT FROM OLD.monthly_milestones_hit THEN
      RAISE EXCEPTION 'Financial fields can only be modified by server-side logic';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_profile_level(p_total_real_spend numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF coalesce(p_total_real_spend, 0) >= 50000 THEN
    RETURN 'vip_diamond';
  ELSIF coalesce(p_total_real_spend, 0) >= 25000 THEN
    RETURN 'vip_gold';
  ELSIF coalesce(p_total_real_spend, 0) >= 10000 THEN
    RETURN 'vip_silver';
  ELSIF coalesce(p_total_real_spend, 0) >= 5000 THEN
    RETURN 'vip_bronze';
  ELSIF coalesce(p_total_real_spend, 0) >= 2000 THEN
    RETURN 'gold';
  ELSIF coalesce(p_total_real_spend, 0) >= 500 THEN
    RETURN 'silver';
  END IF;
  RETURN 'bronze';
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_profile_real_spend(
  p_user_id uuid,
  p_amount numeric
)
RETURNS TABLE(
  total_real_spend numeric,
  monthly_real_spend numeric,
  level text,
  previous_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles%ROWTYPE;
  month_start date;
  next_total numeric;
  next_monthly numeric;
  next_level text;
  old_level text;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Spend amount must be positive';
  END IF;

  SELECT * INTO profile_row
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player profile not found';
  END IF;

  old_level := coalesce(profile_row.level, 'bronze');
  month_start := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  next_total := round(coalesce(profile_row.total_real_spend, 0) + p_amount, 2);
  next_monthly := CASE
    WHEN profile_row.monthly_spend_reset_at IS NULL OR profile_row.monthly_spend_reset_at < month_start
      THEN round(p_amount, 2)
    ELSE round(coalesce(profile_row.monthly_real_spend, 0) + p_amount, 2)
  END;
  next_level := public.compute_profile_level(next_total);

  PERFORM set_config('app.allow_profile_financial_update', 'true', true);

  UPDATE public.profiles
  SET total_real_spend = next_total,
      monthly_real_spend = next_monthly,
      monthly_spend_reset_at = month_start,
      monthly_milestones_hit = CASE
        WHEN profile_row.monthly_spend_reset_at IS NULL OR profile_row.monthly_spend_reset_at < month_start
          THEN '{}'::numeric[]
        ELSE monthly_milestones_hit
      END,
      level = next_level
  WHERE id = p_user_id
  RETURNING * INTO profile_row;

  RETURN QUERY SELECT
    profile_row.total_real_spend,
    profile_row.monthly_real_spend,
    profile_row.level,
    old_level;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_profile_level(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_profile_real_spend(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_profile_level(numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_profile_real_spend(uuid, numeric) TO service_role;
