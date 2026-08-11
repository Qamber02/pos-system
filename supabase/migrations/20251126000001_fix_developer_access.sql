-- Function to check if the current user is a developer
CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'developer'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies for profiles
DROP POLICY IF EXISTS "Developers can do everything" ON public.profiles;

CREATE POLICY "Developers can do everything"
ON public.profiles
FOR ALL
USING (
  public.is_developer()
);

-- Update RLS policies for user_roles
DROP POLICY IF EXISTS "Developers can manage roles" ON public.user_roles;

CREATE POLICY "Developers can manage roles"
ON public.user_roles
FOR ALL
USING (
  public.is_developer()
);

-- Ensure user_roles is readable by the user themselves (to check their own role)
-- and by developers (to manage others)
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;

CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
USING (
  auth.uid() = user_id OR public.is_developer()
);
