-- 1. Add new roles to the enum
-- Note: PostgreSQL doesn't support IF NOT EXISTS for enum values directly in a simple way, 
-- so we wrap in a DO block or just attempt it. 
-- Since we can't easily alter enum inside a transaction in some contexts, we'll use a safer approach.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'restricted';

-- 2. Add status column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 3. Add check constraint for status
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_status_check') THEN 
        ALTER TABLE public.profiles 
        ADD CONSTRAINT profiles_status_check 
        CHECK (status IN ('active', 'suspended', 'banned'));
    END IF; 
END $$;

-- 4. Update RLS to allow developers to do EVERYTHING
CREATE POLICY "Developers can do everything" 
ON public.profiles 
FOR ALL 
USING (
  auth.email() = 'qamberhanif11@gmail.com'
);

-- 5. Allow developers to manage roles
CREATE POLICY "Developers can manage roles" 
ON public.user_roles 
FOR ALL 
USING (
  auth.email() = 'qamberhanif11@gmail.com'
);
