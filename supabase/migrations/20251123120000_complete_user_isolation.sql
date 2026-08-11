-- Complete User Data Isolation - RLS Policies
-- Created: 2025-11-23
-- Purpose: Ensure each user can only access their own data

-- Enable RLS on all tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.held_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_loans ENABLE ROW LEVEL SECURITY;

-- DROP all existing policies to start clean
DROP POLICY IF EXISTS "Users can only view their own loans" ON public.customer_loans;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view variants" ON public.product_variants;

-- PRODUCTS: Complete user isolation
CREATE POLICY "users_own_products_select" ON public.products
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_products_insert" ON public.products
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_products_update" ON public.products
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_products_delete" ON public.products
  FOR DELETE USING (auth.uid() = user_id);

-- CATEGORIES: Complete user isolation
CREATE POLICY "users_own_categories_select" ON public.categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_categories_insert" ON public.categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_categories_update" ON public.categories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_categories_delete" ON public.categories
  FOR DELETE USING (auth.uid() = user_id);

-- CUSTOMERS: Complete user isolation
CREATE POLICY "users_own_customers_select" ON public.customers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_customers_insert" ON public.customers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_customers_update" ON public.customers
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_customers_delete" ON public.customers
  FOR DELETE USING (auth.uid() = user_id);

-- SALES: Complete user isolation
CREATE POLICY "users_own_sales_select" ON public.sales
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_sales_insert" ON public.sales
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_sales_update" ON public.sales
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_sales_delete" ON public.sales
  FOR DELETE USING (auth.uid() = user_id);

-- SALE_ITEMS: Access through parent sale's user_id
CREATE POLICY "users_own_sale_items_select" ON public.sale_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales 
      WHERE sales.id = sale_items.sale_id 
      AND sales.user_id = auth.uid()
    )
  );
CREATE POLICY "users_own_sale_items_insert" ON public.sale_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales 
      WHERE sales.id = sale_items.sale_id 
      AND sales.user_id = auth.uid()
    )
  );

-- SETTINGS: Complete user isolation
CREATE POLICY "users_own_settings_select" ON public.settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_settings_insert" ON public.settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_settings_update" ON public.settings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_settings_delete" ON public.settings
  FOR DELETE USING (auth.uid() = user_id);

-- HELD_CARTS: Complete user isolation
CREATE POLICY "users_own_held_carts_select" ON public.held_carts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_held_carts_insert" ON public.held_carts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_held_carts_update" ON public.held_carts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_held_carts_delete" ON public.held_carts
  FOR DELETE USING (auth.uid() = user_id);

-- PRODUCT_VARIANTS: Complete user isolation
CREATE POLICY "users_own_variants_select" ON public.product_variants
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_variants_insert" ON public.product_variants
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_variants_update" ON public.product_variants
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_variants_delete" ON public.product_variants
  FOR DELETE USING (auth.uid() = user_id);

-- CUSTOMER_LOANS: Complete user isolation
CREATE POLICY "users_own_loans_select" ON public.customer_loans
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_loans_insert" ON public.customer_loans
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_loans_update" ON public.customer_loans
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_loans_delete" ON public.customer_loans
  FOR DELETE USING (auth.uid() = user_id);

-- PROFILES: Users can only view/update their own profile
CREATE POLICY "users_own_profile_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_own_profile_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
