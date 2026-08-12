-- Migration: Phase 3 Parts Reservation & Technician Assignment
-- File: supabase/migrations/20260103000000_ticket_parts_technicians.sql

-- 1. Create technicians table
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

-- Update repair_tickets assigned_tech_id FK to point to public.technicians
ALTER TABLE public.repair_tickets
  DROP CONSTRAINT IF EXISTS repair_tickets_assigned_tech_id_fkey;

ALTER TABLE public.repair_tickets
  ADD CONSTRAINT repair_tickets_assigned_tech_id_fkey
  FOREIGN KEY (assigned_tech_id) REFERENCES public.technicians(id) ON DELETE SET NULL;

-- 2. Create repair_ticket_parts table (Junction for reserved/consumed parts)
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

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_ticket_parts ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for technicians
DROP POLICY IF EXISTS "users_own_technicians_select" ON public.technicians;
DROP POLICY IF EXISTS "users_own_technicians_insert" ON public.technicians;
DROP POLICY IF EXISTS "users_own_technicians_update" ON public.technicians;
DROP POLICY IF EXISTS "users_own_technicians_delete" ON public.technicians;

CREATE POLICY "users_own_technicians_select" ON public.technicians
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_technicians_insert" ON public.technicians
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_technicians_update" ON public.technicians
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_technicians_delete" ON public.technicians
  FOR DELETE USING (auth.uid() = user_id);

-- 5. RLS Policies for repair_ticket_parts
DROP POLICY IF EXISTS "users_own_ticket_parts_select" ON public.repair_ticket_parts;
DROP POLICY IF EXISTS "users_own_ticket_parts_insert" ON public.repair_ticket_parts;
DROP POLICY IF EXISTS "users_own_ticket_parts_update" ON public.repair_ticket_parts;
DROP POLICY IF EXISTS "users_own_ticket_parts_delete" ON public.repair_ticket_parts;

CREATE POLICY "users_own_ticket_parts_select" ON public.repair_ticket_parts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_ticket_parts_insert" ON public.repair_ticket_parts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_ticket_parts_update" ON public.repair_ticket_parts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_ticket_parts_delete" ON public.repair_ticket_parts
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Triggers for updated_at
DROP TRIGGER IF EXISTS update_technicians_updated_at ON public.technicians;
CREATE TRIGGER update_technicians_updated_at
  BEFORE UPDATE ON public.technicians
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_repair_ticket_parts_updated_at ON public.repair_ticket_parts;
CREATE TRIGGER update_repair_ticket_parts_updated_at
  BEFORE UPDATE ON public.repair_ticket_parts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
