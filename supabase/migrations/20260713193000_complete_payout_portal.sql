ALTER TABLE public.payout_requests
  DROP CONSTRAINT IF EXISTS payout_requests_status_check;

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'external_customer',
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS brand_page text,
  ADD COLUMN IF NOT EXISTS recipient_identifier text,
  ADD COLUMN IF NOT EXISTS account_holder_name text,
  ADD COLUMN IF NOT EXISTS amount_requested numeric(14,2),
  ADD COLUMN IF NOT EXISTS actual_amount_paid numeric(14,2),
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS proof_screenshot_url text,
  ADD COLUMN IF NOT EXISTS staff_note text,
  ADD COLUMN IF NOT EXISTS processing_note text,
  ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_approved_by uuid,
  ADD COLUMN IF NOT EXISTS owner_approved_at timestamptz;

UPDATE public.payout_requests
SET
  customer_name = COALESCE(customer_name, player_name),
  amount_requested = COALESCE(amount_requested, amount),
  staff_note = COALESCE(staff_note, note),
  approval_required = COALESCE(amount_requested, amount) > 200,
  status = CASE
    WHEN status = 'sent' THEN 'paid'
    WHEN status = 'cancelled' THEN 'rejected'
    WHEN status = 'pending' AND COALESCE(amount_requested, amount) > 200 THEN 'awaiting_approval'
    WHEN status = 'pending' THEN 'ready_to_process'
    ELSE status
  END;

ALTER TABLE public.payout_requests
  ALTER COLUMN customer_name SET NOT NULL,
  ALTER COLUMN amount_requested SET NOT NULL,
  ADD CONSTRAINT payout_requests_customer_type_check
    CHECK (customer_type IN ('website_player', 'facebook_customer', 'messenger_customer', 'external_customer')),
  ADD CONSTRAINT payout_requests_status_check
    CHECK (status IN ('pending', 'awaiting_approval', 'ready_to_process', 'paid', 'rejected', 'failed')),
  ADD CONSTRAINT payout_requests_amount_requested_check
    CHECK (amount_requested > 0),
  ADD CONSTRAINT payout_requests_actual_amount_paid_check
    CHECK (actual_amount_paid IS NULL OR actual_amount_paid >= 0);

CREATE INDEX IF NOT EXISTS payout_requests_history_search_idx
  ON public.payout_requests(status, brand_page, payment_method_name, created_at DESC);

CREATE INDEX IF NOT EXISTS payout_requests_created_by_idx
  ON public.payout_requests(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS payout_requests_processed_by_idx
  ON public.payout_requests(processed_by, processed_at DESC);

CREATE TABLE IF NOT EXISTS public.payout_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid REFERENCES public.payout_requests(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'approval_required', 'approved', 'completed', 'failed', 'rejected')),
  title text NOT NULL,
  body text NOT NULL,
  amount numeric(14,2),
  created_for uuid,
  email_status text NOT NULL DEFAULT 'not_configured'
    CHECK (email_status IN ('not_configured', 'queued', 'sent', 'failed')),
  email_error text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payout_notifications_created_idx
  ON public.payout_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS payout_notifications_for_idx
  ON public.payout_notifications(created_for, read_at, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.payout_notifications TO authenticated;
GRANT ALL ON public.payout_notifications TO service_role;
ALTER TABLE public.payout_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read payout notifications" ON public.payout_notifications;
CREATE POLICY "Super admins read payout notifications"
  ON public.payout_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR created_for = auth.uid());

DROP POLICY IF EXISTS "Staff create payout notifications" ON public.payout_notifications;
CREATE POLICY "Staff create payout notifications"
  ON public.payout_notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_any_staff_role(auth.uid()));

DROP POLICY IF EXISTS "Super admins update payout notifications" ON public.payout_notifications;
CREATE POLICY "Super admins update payout notifications"
  ON public.payout_notifications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR created_for = auth.uid());
