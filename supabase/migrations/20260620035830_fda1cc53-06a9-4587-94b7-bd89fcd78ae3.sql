
-- ============== ENUMS ==============
CREATE TYPE public.ticket_status AS ENUM ('new','waiting','assigned','in_progress','resolved','closed');
CREATE TYPE public.chat_sender_type AS ENUM ('player','staff','bot','system');

-- ============== support_tickets ==============
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START 1000;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigint NOT NULL DEFAULT nextval('public.support_ticket_number_seq') UNIQUE,
  player_id uuid,
  player_name text,
  player_phone text,
  player_username text,
  game_provider text,
  issue_type text,
  status public.ticket_status NOT NULL DEFAULT 'new',
  assigned_staff_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  last_message_sender public.chat_sender_type,
  unread_count_staff int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_status_idx ON public.support_tickets(status);
CREATE INDEX support_tickets_assigned_idx ON public.support_tickets(assigned_staff_id);
CREATE INDEX support_tickets_last_message_idx ON public.support_tickets(last_message_at DESC);
CREATE INDEX support_tickets_player_idx ON public.support_tickets(player_id);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT USAGE ON SEQUENCE public.support_ticket_number_seq TO service_role, authenticated;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view accessible tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
  OR assigned_staff_id = auth.uid()
  OR (assigned_staff_id IS NULL AND public.has_any_staff_role(auth.uid()))
);

CREATE POLICY "Staff can update accessible tickets"
ON public.support_tickets FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
  OR assigned_staff_id = auth.uid()
  OR (assigned_staff_id IS NULL AND public.has_any_staff_role(auth.uid()))
);

CREATE POLICY "Super admin can delete tickets"
ON public.support_tickets FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== HELPER: ticket access (after support_tickets exists) ==============
CREATE OR REPLACE FUNCTION public.can_access_ticket(_ticket_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = _ticket_id
      AND (
        public.has_role(_user_id, 'super_admin')
        OR public.has_role(_user_id, 'admin')
        OR t.assigned_staff_id = _user_id
        OR (t.assigned_staff_id IS NULL AND public.has_any_staff_role(_user_id))
      )
  )
$$;

-- ============== chat_messages ==============
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type public.chat_sender_type NOT NULL,
  sender_id uuid,
  body text,
  attachment_url text,
  read_by_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_ticket_idx ON public.chat_messages(ticket_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read messages on accessible tickets"
ON public.chat_messages FOR SELECT TO authenticated
USING (public.can_access_ticket(ticket_id, auth.uid()));

CREATE POLICY "Staff can insert messages on accessible tickets"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'staff'
  AND sender_id = auth.uid()
  AND public.can_access_ticket(ticket_id, auth.uid())
);

CREATE POLICY "Staff can update read state on accessible tickets"
ON public.chat_messages FOR UPDATE TO authenticated
USING (public.can_access_ticket(ticket_id, auth.uid()));

-- ============== ticket_notes (staff-only) ==============
CREATE TABLE public.ticket_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_notes_ticket_idx ON public.ticket_notes(ticket_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.ticket_notes TO authenticated;
GRANT ALL ON public.ticket_notes TO service_role;

ALTER TABLE public.ticket_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read notes on accessible tickets"
ON public.ticket_notes FOR SELECT TO authenticated
USING (public.can_access_ticket(ticket_id, auth.uid()));

CREATE POLICY "Staff can write notes on accessible tickets"
ON public.ticket_notes FOR INSERT TO authenticated
WITH CHECK (staff_id = auth.uid() AND public.can_access_ticket(ticket_id, auth.uid()));

CREATE POLICY "Super admin can delete notes"
ON public.ticket_notes FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- ============== ticket_attachments ==============
CREATE TABLE public.ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  url text NOT NULL,
  mime text,
  size_bytes int,
  uploaded_by uuid,
  uploaded_by_type public.chat_sender_type NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_attachments_ticket_idx ON public.ticket_attachments(ticket_id);

GRANT SELECT, INSERT ON public.ticket_attachments TO authenticated;
GRANT ALL ON public.ticket_attachments TO service_role;

ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read attachments on accessible tickets"
ON public.ticket_attachments FOR SELECT TO authenticated
USING (public.can_access_ticket(ticket_id, auth.uid()));

CREATE POLICY "Staff can add attachments on accessible tickets"
ON public.ticket_attachments FOR INSERT TO authenticated
WITH CHECK (public.can_access_ticket(ticket_id, auth.uid()));

-- ============== staff_assignments (audit) ==============
CREATE TABLE public.staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  from_staff_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_staff_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_assignments_ticket_idx ON public.staff_assignments(ticket_id, created_at);

GRANT SELECT, INSERT ON public.staff_assignments TO authenticated;
GRANT ALL ON public.staff_assignments TO service_role;

ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read assignments on accessible tickets"
ON public.staff_assignments FOR SELECT TO authenticated
USING (public.can_access_ticket(ticket_id, auth.uid()));

CREATE POLICY "Staff can insert assignments on accessible tickets"
ON public.staff_assignments FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid() AND public.can_access_ticket(ticket_id, auth.uid()));

-- ============== Trigger: bump ticket on new message ==============
CREATE OR REPLACE FUNCTION public.bump_ticket_on_message()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.support_tickets
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(COALESCE(NEW.body, ''), 200),
    last_message_sender = NEW.sender_type,
    unread_count_staff = CASE
      WHEN NEW.sender_type = 'player' THEN unread_count_staff + 1
      ELSE unread_count_staff
    END,
    status = CASE
      WHEN NEW.sender_type = 'player' AND status IN ('new','resolved','closed') THEN 'waiting'::public.ticket_status
      ELSE status
    END,
    updated_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_bump_ticket_on_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.bump_ticket_on_message();

-- ============== Realtime ==============
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_notes;
