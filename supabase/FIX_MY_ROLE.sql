-- SIMPLE FIX: Add your user to user_roles and set as developer
-- Run this in Supabase SQL Editor

-- Step 1: See all users in the system
SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;

-- Step 2: Insert/Update your role (replace with YOUR actual email from step 1)
-- Change 'your-email@here.com' to match EXACTLY what you see in step 1
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'developer' FROM auth.users 
WHERE email = 'qamberhanif11@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'developer';

-- Step 3: Also update profiles table
UPDATE public.profiles SET role = 'developer'
WHERE email = 'qamberhanif11@gmail.com';

-- Step 4: Verify it worked  
SELECT 
  u.email,
  p.role as profile_role,
  ur.role as user_roles_role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email = 'qamberhanif11@gmail.com';
