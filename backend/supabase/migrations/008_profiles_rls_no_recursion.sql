-- Fix infinite recursion in "Admins can view all profiles" policy.
-- The policy used EXISTS (SELECT ... FROM public.profiles ...), which re-triggered RLS on profiles.
-- Use a SECURITY DEFINER function so the admin check reads profiles without going through RLS.

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;

-- Drop the recursive policy and recreate using the function
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.current_user_is_admin());

-- Grant execute to authenticated and anon so RLS can use it
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO anon;
