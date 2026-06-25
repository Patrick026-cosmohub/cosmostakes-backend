CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_related_deposit_once
  ON public.wallet_ledger(related_deposit)
  WHERE related_deposit IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_related_cashout_once
  ON public.wallet_ledger(related_cashout)
  WHERE related_cashout IS NOT NULL;

CREATE OR REPLACE FUNCTION public.refresh_player_vip_tier(p_player_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lifetime_deposits numeric;
  next_tier_id uuid;
BEGIN
  SELECT coalesce(sum(amount), 0)
  INTO lifetime_deposits
  FROM public.wallet_ledger
  WHERE player_id = p_player_id
    AND type = 'deposit'
    AND related_deposit IS NOT NULL;

  SELECT id
  INTO next_tier_id
  FROM public.vip_tiers
  WHERE is_active = true
    AND deposit_required <= lifetime_deposits
  ORDER BY deposit_required DESC, sort_order DESC, created_at DESC
  LIMIT 1;

  UPDATE public.players
  SET vip_tier_id = next_tier_id
  WHERE id = p_player_id;

  RETURN next_tier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_finance_request(
  p_kind text,
  p_request_id uuid,
  p_decision public.request_status,
  p_note text,
  p_refuj_note text,
  p_staff_id uuid
)
RETURNS TABLE(
  player_id uuid,
  balance numeric,
  vip_tier_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deposit_row public.deposit_requests%ROWTYPE;
  cashout_row public.cashout_requests%ROWTYPE;
  player_row public.players%ROWTYPE;
  request_player_id uuid;
  request_amount numeric;
  next_balance numeric;
  next_tier_id uuid;
  request_note text;
BEGIN
  IF NOT public.can_handle_finance(p_staff_id) THEN
    RAISE EXCEPTION 'Forbidden: finance role required';
  END IF;

  IF p_kind NOT IN ('deposit', 'cashout') THEN
    RAISE EXCEPTION 'Invalid request kind';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected', 'failed', 'uncertain') THEN
    RAISE EXCEPTION 'Invalid request decision';
  END IF;

  IF p_kind = 'deposit' THEN
    SELECT *
    INTO deposit_row
    FROM public.deposit_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Request not found';
    END IF;
    IF deposit_row.status <> 'pending' THEN
      RAISE EXCEPTION 'Request is already %', deposit_row.status;
    END IF;

    request_player_id := deposit_row.player_id;
    request_amount := deposit_row.amount;
    request_note := coalesce(p_note, deposit_row.notes);

    UPDATE public.deposit_requests
    SET status = p_decision,
        processed_at = now(),
        processed_by = p_staff_id,
        notes = nullif(array_to_string(array_remove(ARRAY[request_note, p_refuj_note], NULL), E'\n'), '')
    WHERE id = p_request_id;
  ELSE
    SELECT *
    INTO cashout_row
    FROM public.cashout_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Request not found';
    END IF;
    IF cashout_row.status <> 'pending' THEN
      RAISE EXCEPTION 'Request is already %', cashout_row.status;
    END IF;

    request_player_id := cashout_row.player_id;
    request_amount := cashout_row.amount;
    request_note := coalesce(p_note, cashout_row.notes);

    UPDATE public.cashout_requests
    SET status = p_decision,
        processed_at = now(),
        processed_by = p_staff_id,
        notes = nullif(array_to_string(array_remove(ARRAY[request_note, p_refuj_note], NULL), E'\n'), '')
    WHERE id = p_request_id;
  END IF;

  SELECT *
  INTO player_row
  FROM public.players
  WHERE id = request_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF p_decision = 'approved' THEN
    next_balance := round(coalesce(player_row.balance, 0) + request_amount, 2);

    UPDATE public.players
    SET balance = next_balance
    WHERE id = request_player_id;

    INSERT INTO public.wallet_ledger (
      player_id,
      type,
      amount,
      balance_after,
      staff_id,
      related_deposit,
      related_cashout,
      reason
    )
    VALUES (
      request_player_id,
      'deposit',
      request_amount,
      next_balance,
      p_staff_id,
      CASE WHEN p_kind = 'deposit' THEN p_request_id ELSE NULL END,
      CASE WHEN p_kind = 'cashout' THEN p_request_id ELSE NULL END,
      coalesce(
        p_note,
        CASE WHEN p_kind = 'cashout' THEN 'manual redeem approval' ELSE 'deposit approval' END
      )
    );

    IF p_kind = 'deposit' THEN
      next_tier_id := public.refresh_player_vip_tier(request_player_id);
    ELSE
      next_tier_id := player_row.vip_tier_id;
    END IF;
  ELSE
    next_balance := player_row.balance;
    next_tier_id := player_row.vip_tier_id;
  END IF;

  RETURN QUERY SELECT request_player_id, next_balance, next_tier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_player_wallet(
  p_player_id uuid,
  p_delta numeric,
  p_reason text,
  p_staff_id uuid
)
RETURNS TABLE(balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  player_row public.players%ROWTYPE;
  next_balance numeric;
BEGIN
  IF NOT public.can_handle_finance(p_staff_id) THEN
    RAISE EXCEPTION 'Forbidden: finance role required';
  END IF;

  IF p_delta = 0 THEN
    RAISE EXCEPTION 'Adjustment amount cannot be zero';
  END IF;

  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Adjustment reason is required';
  END IF;

  SELECT *
  INTO player_row
  FROM public.players
  WHERE id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  next_balance := round(coalesce(player_row.balance, 0) + p_delta, 2);
  IF next_balance < 0 THEN
    RAISE EXCEPTION 'Adjustment would result in negative balance';
  END IF;

  UPDATE public.players
  SET balance = next_balance
  WHERE id = p_player_id;

  INSERT INTO public.wallet_ledger (
    player_id,
    type,
    amount,
    balance_after,
    staff_id,
    reason
  )
  VALUES (
    p_player_id,
    CASE WHEN p_delta > 0 THEN 'manual_credit'::public.ledger_type ELSE 'manual_debit'::public.ledger_type END,
    round(p_delta, 2),
    next_balance,
    p_staff_id,
    p_reason
  );

  RETURN QUERY SELECT next_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_player_vip_tier(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_finance_request(text, uuid, public.request_status, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_player_wallet(uuid, numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_player_vip_tier(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_finance_request(text, uuid, public.request_status, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_player_wallet(uuid, numeric, text, uuid) TO authenticated, service_role;
