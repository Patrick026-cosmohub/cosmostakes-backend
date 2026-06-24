CREATE OR REPLACE FUNCTION public.compute_profile_level(p_total_real_spend numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF coalesce(p_total_real_spend, 0) >= 5000 THEN
    RETURN 'elite';
  ELSIF coalesce(p_total_real_spend, 0) >= 2000 THEN
    RETURN 'platinum';
  ELSIF coalesce(p_total_real_spend, 0) >= 1000 THEN
    RETURN 'gold';
  ELSIF coalesce(p_total_real_spend, 0) >= 500 THEN
    RETURN 'silver';
  END IF;
  RETURN 'bronze';
END;
$$;

UPDATE public.profiles
SET level = public.compute_profile_level(total_real_spend)
WHERE level IS DISTINCT FROM public.compute_profile_level(total_real_spend);

REVOKE ALL ON FUNCTION public.compute_profile_level(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_profile_level(numeric) TO authenticated, service_role;
