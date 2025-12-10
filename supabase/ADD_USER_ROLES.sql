-- ADD USER_ROLES TABLE
-- Run this AFTER the main setup to add the missing user_roles table

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'developer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_role_select" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Update the handle_new_user function to also create a user_role entry
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (NEW.id, NEW.email, 'user', 'active');
  
  INSERT INTO public.settings (user_id, business_name)
  VALUES (NEW.id, 'My Store');
  
  -- Add user_roles entry
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
