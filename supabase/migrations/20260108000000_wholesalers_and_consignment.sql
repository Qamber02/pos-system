-- ====================================================================
-- MIGRATION: Phase 5 — Wholesaler Credit & Consignment Tracking
-- ====================================================================

-- 1. Wholesalers Table
CREATE TABLE IF NOT EXISTS public.wholesalers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Wholesaler Intakes Table (Consignment Stock)
CREATE TABLE IF NOT EXISTS public.wholesaler_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wholesaler_id UUID NOT NULL REFERENCES public.wholesalers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  agreed_unit_cost DECIMAL(10,2) NOT NULL CHECK (agreed_unit_cost >= 0),
  total_cost DECIMAL(10,2) NOT NULL CHECK (total_cost >= 0),
  amount_paid DECIMAL(10,2) DEFAULT 0 CHECK (amount_paid >= 0),
  intake_date TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Wholesaler Payments Table
CREATE TABLE IF NOT EXISTS public.wholesaler_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wholesaler_id UUID NOT NULL REFERENCES public.wholesalers(id) ON DELETE CASCADE,
  intake_id UUID REFERENCES public.wholesaler_intakes(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT DEFAULT 'cash',
  payment_date TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Link repair_ticket_parts to wholesaler_intakes & wholesalers
ALTER TABLE public.repair_ticket_parts
  ADD COLUMN IF NOT EXISTS wholesaler_id UUID REFERENCES public.wholesalers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wholesaler_intake_id UUID REFERENCES public.wholesaler_intakes(id) ON DELETE SET NULL;

-- Enable RLS & Policies
ALTER TABLE public.wholesalers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesaler_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesaler_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_wholesalers_select" ON public.wholesalers;
DROP POLICY IF EXISTS "users_own_wholesalers_insert" ON public.wholesalers;
DROP POLICY IF EXISTS "users_own_wholesalers_update" ON public.wholesalers;
DROP POLICY IF EXISTS "users_own_wholesalers_delete" ON public.wholesalers;
CREATE POLICY "users_own_wholesalers_select" ON public.wholesalers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_wholesalers_insert" ON public.wholesalers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_wholesalers_update" ON public.wholesalers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_wholesalers_delete" ON public.wholesalers FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_intakes_select" ON public.wholesaler_intakes;
DROP POLICY IF EXISTS "users_own_intakes_insert" ON public.wholesaler_intakes;
DROP POLICY IF EXISTS "users_own_intakes_update" ON public.wholesaler_intakes;
DROP POLICY IF EXISTS "users_own_intakes_delete" ON public.wholesaler_intakes;
CREATE POLICY "users_own_intakes_select" ON public.wholesaler_intakes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_intakes_insert" ON public.wholesaler_intakes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_intakes_update" ON public.wholesaler_intakes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_intakes_delete" ON public.wholesaler_intakes FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_payments_select" ON public.wholesaler_payments;
DROP POLICY IF EXISTS "users_own_payments_insert" ON public.wholesaler_payments;
CREATE POLICY "users_own_payments_select" ON public.wholesaler_payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_payments_insert" ON public.wholesaler_payments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wholesalers_user_id ON public.wholesalers(user_id);
CREATE INDEX IF NOT EXISTS idx_intakes_user_id ON public.wholesaler_intakes(user_id);
CREATE INDEX IF NOT EXISTS idx_intakes_wholesaler_id ON public.wholesaler_intakes(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_payments_wholesaler_id ON public.wholesaler_payments(wholesaler_id);
