-- Migration: Update RLS policies to allow access to global (NULL user_id) data
-- Created: 2025-11-21

-- 1. Products
DROP POLICY IF EXISTS "Users can view their own products" ON public.products;
CREATE POLICY "Users can view own or global products" ON public.products FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- 2. Categories
DROP POLICY IF EXISTS "Users can view their own categories" ON public.categories;
CREATE POLICY "Users can view own or global categories" ON public.categories FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- 3. Product Variants
DROP POLICY IF EXISTS "Users can view their own product variants" ON public.product_variants;
CREATE POLICY "Users can view own or global product variants" ON public.product_variants FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- 4. Customers (Optional, but good for shared customer base in demo)
DROP POLICY IF EXISTS "Users can view their own customers" ON public.customers;
CREATE POLICY "Users can view own or global customers" ON public.customers FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
