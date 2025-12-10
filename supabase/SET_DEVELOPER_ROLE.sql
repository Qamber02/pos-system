-- SET DEVELOPER ROLE FOR qamberhanif11@gmail.com
-- Run this in Supabase SQL Editor

-- Update profiles table
UPDATE public.profiles
SET role = 'developer'
WHERE email = 'qamberhanif11@gmail.com';

-- Update user_roles table
UPDATE public.user_roles
SET role = 'developer'
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'qamberhanif11@gmail.com'
);

-- Verify the changes
SELECT id, email, role FROM public.profiles WHERE email = 'qamberhanif11@gmail.com';
SELECT user_id, role FROM public.user_roles WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'qamberhanif11@gmail.com'
);
