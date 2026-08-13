-- ====================================================================
-- POS SHOPPING SYSTEM - 100% COMPLETE MASTER DATABASE SETUP (FIXED ORDER)
-- ====================================================================
-- Run this ONCE in your Supabase Cloud Dashboard -> SQL Editor
-- This script contains ALL 16 tables in perfect dependency order.
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USER & SETTINGS TABLES
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

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'developer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

-- 3. INVENTORY & CATEGORY TABLES
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  retail_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(10,2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  barcode TEXT,
  is_serialized BOOLEAN DEFAULT false,
  condition_grade TEXT DEFAULT 'new',
  is_repair_part BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  variant_name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  price_adjustment DECIMAL(10,2) DEFAULT 0,
  cost_price DECIMAL(10,2) DEFAULT 0,
  retail_price DECIMAL(10,2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_serialized BOOLEAN DEFAULT false,
  condition_grade TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. DEVICE IDENTIFIERS & PART COMPATIBILITY
CREATE TABLE IF NOT EXISTS public.device_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imei TEXT,
  serial_number TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  condition_grade TEXT DEFAULT 'new',
  status TEXT DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'sold', 'in_repair', 'scrapped', 'returned')),
  cost NUMERIC(10, 2) DEFAULT 0,
  sell_price NUMERIC(10, 2) DEFAULT 0,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.part_compatibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
  device_model TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TECHNICIANS & REPAIR TICKETS
CREATE TABLE IF NOT EXISTS public.technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  specialty TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repair_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  device_identifier_id UUID REFERENCES public.device_identifiers(id) ON DELETE SET NULL,
  device_name TEXT NOT NULL,
  serial_or_imei TEXT,
  issue_description TEXT NOT NULL,
  estimated_cost NUMERIC(10, 2) DEFAULT 0,
  deposit_paid NUMERIC(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'received' CHECK (status IN (
    'received', 'diagnosing', 'awaiting_approval', 'approved',
    'declined', 'awaiting_parts', 'in_repair', 'qc_testing',
    'ready_for_pickup', 'completed', 'cancelled'
  )),
  assigned_tech_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repair_ticket_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_ticket_id UUID NOT NULL REFERENCES public.repair_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repair_ticket_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repair_ticket_id UUID NOT NULL REFERENCES public.repair_tickets(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
  unit_cost NUMERIC(10, 2) DEFAULT 0,
  unit_price NUMERIC(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'returned')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. LOANS & SALES TABLES (DEPENDENT ON PRODUCTS & REPAIRS & DEVICES)
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
  synced BOOLEAN DEFAULT true,
  lastmodified BIGINT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  change_amount DECIMAL(10,2) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  receipt_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  device_identifier_id UUID REFERENCES public.device_identifiers(id) ON DELETE SET NULL,
  repair_ticket_id UUID REFERENCES public.repair_tickets(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) DEFAULT 0,
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.held_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cart_name TEXT NOT NULL,
  cart_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. INDEXES FOR HIGH-PERFORMANCE SEARCH & QUERYING
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
CREATE INDEX IF NOT EXISTS idx_device_identifiers_user_id ON public.device_identifiers(user_id);
CREATE INDEX IF NOT EXISTS idx_repair_tickets_user_id ON public.repair_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- 9. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.held_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_ticket_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_ticket_parts ENABLE ROW LEVEL SECURITY;

-- 10. RLS POLICIES (DROP EXISTING TO AVOID CONFLICTS THEN CREATE)
DROP POLICY IF EXISTS "users_own_profile_select" ON public.profiles;
DROP POLICY IF EXISTS "users_own_profile_update" ON public.profiles;
CREATE POLICY "users_own_profile_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_own_profile_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_own_user_roles_select" ON public.user_roles;
CREATE POLICY "users_own_user_roles_select" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_settings_select" ON public.settings;
DROP POLICY IF EXISTS "users_own_settings_insert" ON public.settings;
DROP POLICY IF EXISTS "users_own_settings_update" ON public.settings;
DROP POLICY IF EXISTS "users_own_settings_delete" ON public.settings;
CREATE POLICY "users_own_settings_select" ON public.settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_settings_insert" ON public.settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_settings_update" ON public.settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_settings_delete" ON public.settings FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_categories_select" ON public.categories;
DROP POLICY IF EXISTS "users_own_categories_insert" ON public.categories;
DROP POLICY IF EXISTS "users_own_categories_update" ON public.categories;
DROP POLICY IF EXISTS "users_own_categories_delete" ON public.categories;
CREATE POLICY "users_own_categories_select" ON public.categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_categories_insert" ON public.categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_categories_update" ON public.categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_categories_delete" ON public.categories FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_products_select" ON public.products;
DROP POLICY IF EXISTS "users_own_products_insert" ON public.products;
DROP POLICY IF EXISTS "users_own_products_update" ON public.products;
DROP POLICY IF EXISTS "users_own_products_delete" ON public.products;
CREATE POLICY "users_own_products_select" ON public.products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_products_insert" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_products_update" ON public.products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_products_delete" ON public.products FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_variants_select" ON public.product_variants;
DROP POLICY IF EXISTS "users_own_variants_insert" ON public.product_variants;
DROP POLICY IF EXISTS "users_own_variants_update" ON public.product_variants;
DROP POLICY IF EXISTS "users_own_variants_delete" ON public.product_variants;
CREATE POLICY "users_own_variants_select" ON public.product_variants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_variants_insert" ON public.product_variants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_variants_update" ON public.product_variants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_variants_delete" ON public.product_variants FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_customers_select" ON public.customers;
DROP POLICY IF EXISTS "users_own_customers_insert" ON public.customers;
DROP POLICY IF EXISTS "users_own_customers_update" ON public.customers;
DROP POLICY IF EXISTS "users_own_customers_delete" ON public.customers;
CREATE POLICY "users_own_customers_select" ON public.customers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_customers_insert" ON public.customers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_customers_update" ON public.customers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_customers_delete" ON public.customers FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_loans_select" ON public.customer_loans;
DROP POLICY IF EXISTS "users_own_loans_insert" ON public.customer_loans;
DROP POLICY IF EXISTS "users_own_loans_update" ON public.customer_loans;
DROP POLICY IF EXISTS "users_own_loans_delete" ON public.customer_loans;
CREATE POLICY "users_own_loans_select" ON public.customer_loans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_loans_insert" ON public.customer_loans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_loans_update" ON public.customer_loans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_loans_delete" ON public.customer_loans FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_sales_select" ON public.sales;
DROP POLICY IF EXISTS "users_own_sales_insert" ON public.sales;
DROP POLICY IF EXISTS "users_own_sales_update" ON public.sales;
DROP POLICY IF EXISTS "users_own_sales_delete" ON public.sales;
CREATE POLICY "users_own_sales_select" ON public.sales FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_sales_insert" ON public.sales FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_sales_update" ON public.sales FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_sales_delete" ON public.sales FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_sale_items_select" ON public.sale_items;
DROP POLICY IF EXISTS "users_own_sale_items_insert" ON public.sale_items;
CREATE POLICY "users_own_sale_items_select" ON public.sale_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);
CREATE POLICY "users_own_sale_items_insert" ON public.sale_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);

DROP POLICY IF EXISTS "users_own_held_carts_select" ON public.held_carts;
DROP POLICY IF EXISTS "users_own_held_carts_insert" ON public.held_carts;
DROP POLICY IF EXISTS "users_own_held_carts_update" ON public.held_carts;
DROP POLICY IF EXISTS "users_own_held_carts_delete" ON public.held_carts;
CREATE POLICY "users_own_held_carts_select" ON public.held_carts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_held_carts_insert" ON public.held_carts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_held_carts_update" ON public.held_carts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_held_carts_delete" ON public.held_carts FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_device_identifiers_select" ON public.device_identifiers;
DROP POLICY IF EXISTS "users_own_device_identifiers_insert" ON public.device_identifiers;
DROP POLICY IF EXISTS "users_own_device_identifiers_update" ON public.device_identifiers;
DROP POLICY IF EXISTS "users_own_device_identifiers_delete" ON public.device_identifiers;
CREATE POLICY "users_own_device_identifiers_select" ON public.device_identifiers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_device_identifiers_insert" ON public.device_identifiers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_device_identifiers_update" ON public.device_identifiers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_device_identifiers_delete" ON public.device_identifiers FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_part_compatibility_select" ON public.part_compatibility;
DROP POLICY IF EXISTS "users_own_part_compatibility_insert" ON public.part_compatibility;
DROP POLICY IF EXISTS "users_own_part_compatibility_update" ON public.part_compatibility;
DROP POLICY IF EXISTS "users_own_part_compatibility_delete" ON public.part_compatibility;
CREATE POLICY "users_own_part_compatibility_select" ON public.part_compatibility FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_part_compatibility_insert" ON public.part_compatibility FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_part_compatibility_update" ON public.part_compatibility FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_part_compatibility_delete" ON public.part_compatibility FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_technicians_select" ON public.technicians;
DROP POLICY IF EXISTS "users_own_technicians_insert" ON public.technicians;
DROP POLICY IF EXISTS "users_own_technicians_update" ON public.technicians;
DROP POLICY IF EXISTS "users_own_technicians_delete" ON public.technicians;
CREATE POLICY "users_own_technicians_select" ON public.technicians FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_technicians_insert" ON public.technicians FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_technicians_update" ON public.technicians FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_technicians_delete" ON public.technicians FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_repair_tickets_select" ON public.repair_tickets;
DROP POLICY IF EXISTS "users_own_repair_tickets_insert" ON public.repair_tickets;
DROP POLICY IF EXISTS "users_own_repair_tickets_update" ON public.repair_tickets;
DROP POLICY IF EXISTS "users_own_repair_tickets_delete" ON public.repair_tickets;
CREATE POLICY "users_own_repair_tickets_select" ON public.repair_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_repair_tickets_insert" ON public.repair_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_repair_tickets_update" ON public.repair_tickets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_repair_tickets_delete" ON public.repair_tickets FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_repair_history_select" ON public.repair_ticket_status_history;
DROP POLICY IF EXISTS "users_own_repair_history_insert" ON public.repair_ticket_status_history;
CREATE POLICY "users_own_repair_history_select" ON public.repair_ticket_status_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_repair_history_insert" ON public.repair_ticket_status_history FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_ticket_parts_select" ON public.repair_ticket_parts;
DROP POLICY IF EXISTS "users_own_ticket_parts_insert" ON public.repair_ticket_parts;
DROP POLICY IF EXISTS "users_own_ticket_parts_update" ON public.repair_ticket_parts;
DROP POLICY IF EXISTS "users_own_ticket_parts_delete" ON public.repair_ticket_parts;
CREATE POLICY "users_own_ticket_parts_select" ON public.repair_ticket_parts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_ticket_parts_insert" ON public.repair_ticket_parts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_ticket_parts_update" ON public.repair_ticket_parts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_ticket_parts_delete" ON public.repair_ticket_parts FOR DELETE USING (auth.uid() = user_id);

-- 11. SCHEMAS, SEQUENCES & TABLE PERMISSIONS
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 12. AUTOMATIC USER REGISTRATION TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (NEW.id, NEW.email, 'user', 'active')
  ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id) DO NOTHING;
  
  INSERT INTO public.settings (user_id, business_name)
  VALUES (NEW.id, 'My Store')
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ====================================================================
-- MASTER SETUP COMPLETE! ALL 16 TABLES & POLICIES ARE FULLY INTEGRATED
-- ====================================================================
