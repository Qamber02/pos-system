-- 1. FIX PROFILES (Staff Page Issue)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Developers can do everything" ON public.profiles;

-- Create new, simplified policies
-- Allow everyone to view profiles (fixes the Staff page loading issue)
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
-- Allow users to manage their own profile
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
-- Restore developer access
CREATE POLICY "Developers can do everything" ON public.profiles FOR ALL USING (auth.email() = 'qamberhanif11@gmail.com');

-- Backfill profiles from auth.users (Crucial for showing existing users)
INSERT INTO public.profiles (id, email, full_name)
SELECT id, email, raw_user_meta_data->>'full_name'
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- 2. FIX PRODUCT VARIANTS (Console Error: variant_name column missing)
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- Update existing records to have a default variant_name
UPDATE public.product_variants 
SET variant_name = name 
WHERE variant_name IS NULL;

-- Now make it NOT NULL
ALTER TABLE public.product_variants 
ALTER COLUMN variant_name SET NOT NULL;

-- Add other missing columns if they don't exist
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS price_adjustment DECIMAL(10,2) DEFAULT 0;


-- 3. FIX CUSTOMER LOANS (Console Error: table not found)
CREATE TABLE IF NOT EXISTS public.customer_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  loan_amount DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  remaining_balance DECIMAL(10,2) GENERATED ALWAYS AS (loan_amount - amount_paid) STORED,
  loan_date TIMESTAMPTZ DEFAULT now(),
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  notes TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced BOOLEAN DEFAULT false,
  lastModified BIGINT
);

ALTER TABLE public.customer_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.customer_loans;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.customer_loans;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.customer_loans;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.customer_loans;

CREATE POLICY "Enable read access for all users" ON public.customer_loans FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.customer_loans FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON public.customer_loans FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users only" ON public.customer_loans FOR DELETE USING (auth.role() = 'authenticated');