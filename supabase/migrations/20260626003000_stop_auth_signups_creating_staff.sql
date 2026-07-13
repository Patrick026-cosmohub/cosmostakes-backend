-- Player/front-end auth signups must not become staff records.
-- Staff are now created manually in the admin dashboard, while the existing
-- super admin remains managed through Supabase Auth.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace cn ON cn.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE t.tgname = 'on_auth_user_created'
      AND cn.nspname = 'auth'
      AND c.relname = 'users'
      AND pn.nspname = 'public'
      AND p.proname = 'handle_new_staff_user'
      AND NOT t.tgisinternal
  ) THEN
    DROP TRIGGER on_auth_user_created ON auth.users;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.handle_new_staff_user();

DELETE FROM public.staff_profiles sp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = sp.id
);
