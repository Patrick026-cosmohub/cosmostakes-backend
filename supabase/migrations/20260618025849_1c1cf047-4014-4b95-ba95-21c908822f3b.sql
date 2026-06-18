CREATE TABLE public.juwa_debug_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  platform text,
  endpoint text,
  sent_fields jsonb,
  response_status int,
  response_body text,
  juwa_code int,
  juwa_msg text,
  error_message text
);
GRANT ALL ON public.juwa_debug_log TO service_role;
GRANT SELECT ON public.juwa_debug_log TO authenticated;
ALTER TABLE public.juwa_debug_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read juwa debug log" ON public.juwa_debug_log FOR SELECT TO authenticated USING (public.has_any_staff_role(auth.uid()));