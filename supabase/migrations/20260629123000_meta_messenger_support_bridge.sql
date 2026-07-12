CREATE TABLE IF NOT EXISTS public.meta_pages (
  page_id text PRIMARY KEY,
  page_name text,
  page_access_token text,
  token_status text NOT NULL DEFAULT 'unknown',
  token_source text,
  is_enabled boolean NOT NULL DEFAULT true,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meta_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL REFERENCES public.meta_pages(page_id) ON DELETE CASCADE,
  psid text NOT NULL,
  support_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  user_name text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_count_staff int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, psid)
);

CREATE TABLE IF NOT EXISTS public.meta_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.meta_conversations(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  psid text NOT NULL,
  external_message_id text,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  body text,
  attachment_url text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  support_chat_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_conversations_ticket_idx
  ON public.meta_conversations(support_ticket_id);

CREATE INDEX IF NOT EXISTS meta_conversations_last_message_idx
  ON public.meta_conversations(last_message_at DESC);

CREATE INDEX IF NOT EXISTS meta_messages_conversation_idx
  ON public.meta_messages(conversation_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS meta_messages_external_unique_idx
  ON public.meta_messages(page_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

GRANT SELECT ON public.meta_pages TO authenticated;
GRANT SELECT ON public.meta_conversations TO authenticated;
GRANT SELECT ON public.meta_messages TO authenticated;
GRANT ALL ON public.meta_pages TO service_role;
GRANT ALL ON public.meta_conversations TO service_role;
GRANT ALL ON public.meta_messages TO service_role;

ALTER TABLE public.meta_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read meta pages" ON public.meta_pages;
CREATE POLICY "Staff can read meta pages"
ON public.meta_pages FOR SELECT TO authenticated
USING (public.has_any_staff_role(auth.uid()));

DROP POLICY IF EXISTS "Staff can read meta conversations" ON public.meta_conversations;
CREATE POLICY "Staff can read meta conversations"
ON public.meta_conversations FOR SELECT TO authenticated
USING (
  support_ticket_id IS NOT NULL
  AND public.can_access_ticket(support_ticket_id, auth.uid())
);

DROP POLICY IF EXISTS "Staff can read meta messages" ON public.meta_messages;
CREATE POLICY "Staff can read meta messages"
ON public.meta_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.meta_conversations c
    WHERE c.id = conversation_id
      AND c.support_ticket_id IS NOT NULL
      AND public.can_access_ticket(c.support_ticket_id, auth.uid())
  )
);
