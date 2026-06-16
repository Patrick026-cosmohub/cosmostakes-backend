
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_staff_role(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_handle_finance(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_staff_role(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_handle_finance(UUID) TO authenticated, service_role;
