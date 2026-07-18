ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS cspay_mch_order_no text,
  ADD COLUMN IF NOT EXISTS cspay_order_id text,
  ADD COLUMN IF NOT EXISTS cspay_pay_way text,
  ADD COLUMN IF NOT EXISTS cspay_provider_status text,
  ADD COLUMN IF NOT EXISTS cspay_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cspay_error text,
  ADD COLUMN IF NOT EXISTS cspay_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS cspay_checked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS payout_requests_cspay_mch_order_no_idx
  ON public.payout_requests(cspay_mch_order_no)
  WHERE cspay_mch_order_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS payout_requests_cspay_status_idx
  ON public.payout_requests(cspay_provider_status, cspay_sent_at DESC);

