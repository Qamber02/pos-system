-- Secure RLS Policies
-- Created: 2025-11-23

-- 1. Secure Customer Loans (Financial Data)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.customer_loans;
CREATE POLICY "Users can only view their own loans" 
ON public.customer_loans FOR SELECT 
USING (auth.uid() = user_id);

-- 2. Secure Profiles (PII)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" 
ON public.profiles FOR SELECT 
USING (auth.role() = 'authenticated');

-- 3. Secure Product Variants
DROP POLICY IF EXISTS "Enable read access for all users" ON public.product_variants;
CREATE POLICY "Authenticated users can view variants" 
ON public.product_variants FOR SELECT 
USING (auth.role() = 'authenticated');
