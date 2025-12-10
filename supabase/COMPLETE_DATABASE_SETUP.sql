-- ============================================
-- COMPLETE SUPABASE DATABASE SETUP - FIXED
-- POS Shopping System - Full Backend Rebuild  
-- ============================================
-- Run this ONCE in Supabase SQL Editor

-- ============================================
-- 1. ENABLE EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 2. CREATE ALL TABLES
-- ============================================

-- PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'developer')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  business_name TEXT DEFAULT 'My Store',
  logo_url TEXT,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  currency_symbol TEXT DEFAULT 'PKR',
  receipt_footer TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  retail_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(10,2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- PRODUCT_VARIANTS TABLE
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  variant_name TEXT NOT NULL,
  sku TEXT,
  price_adjustment DECIMAL(10,2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CUSTOMER_LOANS TABLE
CREATE TABLE IF NOT EXISTS public.customer_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  loan_amount DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  remaining_balance DECIMAL(10,2) NOT NULL,
  loan_date TIMESTAMPTZ DEFAULT now(),
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid', 'overdue')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SALES TABLE
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  receipt_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SALE_ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- HELD_CARTS TABLE
CREATE TABLE IF NOT EXISTS public.held_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cart_name TEXT NOT NULL,
  cart_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_user_id ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_user_id ON public.product_variants(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_loans_user_id ON public.customer_loans(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_loans_customer_id ON public.customer_loans(customer_id);

-- ============================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.held_carts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. CREATE RLS POLICIES
-- ============================================

-- PROFILES
CREATE POLICY "users_own_profile_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_own_profile_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- SETTINGS
CREATE POLICY "users_own_settings_select" ON public.settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_settings_insert" ON public.settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_settings_update" ON public.settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_settings_delete" ON public.settings FOR DELETE USING (auth.uid() = user_id);

-- CATEGORIES
CREATE POLICY "users_own_categories_select" ON public.categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_categories_insert" ON public.categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_categories_update" ON public.categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_categories_delete" ON public.categories FOR DELETE USING (auth.uid() = user_id);

-- PRODUCTS
CREATE POLICY "users_own_products_select" ON public.products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_products_insert" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_products_update" ON public.products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_products_delete" ON public.products FOR DELETE USING (auth.uid() = user_id);

-- PRODUCT_VARIANTS
CREATE POLICY "users_own_variants_select" ON public.product_variants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_variants_insert" ON public.product_variants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_variants_update" ON public.product_variants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_variants_delete" ON public.product_variants FOR DELETE USING (auth.uid() = user_id);

-- CUSTOMERS
CREATE POLICY "users_own_customers_select" ON public.customers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_customers_insert" ON public.customers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_customers_update" ON public.customers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_customers_delete" ON public.customers FOR DELETE USING (auth.uid() = user_id);

-- CUSTOMER_LOANS
CREATE POLICY "users_own_loans_select" ON public.customer_loans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_loans_insert" ON public.customer_loans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_loans_update" ON public.customer_loans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_loans_delete" ON public.customer_loans FOR DELETE USING (auth.uid() = user_id);

-- SALES
CREATE POLICY "users_own_sales_select" ON public.sales FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_sales_insert" ON public.sales FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_sales_update" ON public.sales FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_sales_delete" ON public.sales FOR DELETE USING (auth.uid() = user_id);

-- SALE_ITEMS
CREATE POLICY "users_own_sale_items_select" ON public.sale_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);
CREATE POLICY "users_own_sale_items_insert" ON public.sale_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);

-- HELD_CARTS
CREATE POLICY "users_own_held_carts_select" ON public.held_carts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_held_carts_insert" ON public.held_carts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_held_carts_update" ON public.held_carts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_held_carts_delete" ON public.held_carts FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 6. CREATE TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_customer_loans_updated_at BEFORE UPDATE ON public.customer_loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_held_carts_updated_at BEFORE UPDATE ON public.held_carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 7. AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (NEW.id, NEW.email, 'user', 'active');
  
  INSERT INTO public.settings (user_id, business_name)
  VALUES (NEW.id, 'My Store');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SETUP COMPLETE!
-- ============================================
