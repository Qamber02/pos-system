-- Migration: Phase 1 Core Schema Extension for Devices & Parts
-- File: supabase/migrations/20260101000000_core_schema_devices_parts.sql

-- 1. Extend products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_serialized BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS condition_grade TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS is_repair_part BOOLEAN DEFAULT false;

-- 2. Extend product_variants table
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS is_serialized BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS condition_grade TEXT DEFAULT 'new';

-- 3. Create device_identifiers table (tracking unique IMEIs/Serials)
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

-- 4. Create part_compatibility table (mapping repair parts to device models)
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

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.device_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_compatibility ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for device_identifiers
DROP POLICY IF EXISTS "users_own_device_identifiers_select" ON public.device_identifiers;
DROP POLICY IF EXISTS "users_own_device_identifiers_insert" ON public.device_identifiers;
DROP POLICY IF EXISTS "users_own_device_identifiers_update" ON public.device_identifiers;
DROP POLICY IF EXISTS "users_own_device_identifiers_delete" ON public.device_identifiers;

CREATE POLICY "users_own_device_identifiers_select" ON public.device_identifiers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_device_identifiers_insert" ON public.device_identifiers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_device_identifiers_update" ON public.device_identifiers
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_device_identifiers_delete" ON public.device_identifiers
  FOR DELETE USING (auth.uid() = user_id);

-- 7. RLS Policies for part_compatibility
DROP POLICY IF EXISTS "users_own_part_compatibility_select" ON public.part_compatibility;
DROP POLICY IF EXISTS "users_own_part_compatibility_insert" ON public.part_compatibility;
DROP POLICY IF EXISTS "users_own_part_compatibility_update" ON public.part_compatibility;
DROP POLICY IF EXISTS "users_own_part_compatibility_delete" ON public.part_compatibility;

CREATE POLICY "users_own_part_compatibility_select" ON public.part_compatibility
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_part_compatibility_insert" ON public.part_compatibility
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_part_compatibility_update" ON public.part_compatibility
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_part_compatibility_delete" ON public.part_compatibility
  FOR DELETE USING (auth.uid() = user_id);

-- 8. Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_device_identifiers_updated_at ON public.device_identifiers;
CREATE TRIGGER update_device_identifiers_updated_at
  BEFORE UPDATE ON public.device_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_part_compatibility_updated_at ON public.part_compatibility;
CREATE TRIGGER update_part_compatibility_updated_at
  BEFORE UPDATE ON public.part_compatibility
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
