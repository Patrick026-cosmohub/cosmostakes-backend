ALTER TABLE public.meta_pages
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_subscription_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS webhook_subscribed_fields text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS webhook_checked_at timestamptz;

ALTER TABLE public.meta_conversations
  ADD COLUMN IF NOT EXISTS user_name text;
