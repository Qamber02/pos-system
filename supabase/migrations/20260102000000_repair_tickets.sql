-- Migration: Phase 2 Repair Ticket Module Core
-- File: supabase/migrations/20260102000000_repair_tickets.sql

-- 1. Create repair_tickets table
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
  assigned_tech_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create repair_ticket_status_history table (Audit Log)
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

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.repair_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_ticket_status_history ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for repair_tickets
DROP POLICY IF EXISTS "users_own_repair_tickets_select" ON public.repair_tickets;
DROP POLICY IF EXISTS "users_own_repair_tickets_insert" ON public.repair_tickets;
DROP POLICY IF EXISTS "users_own_repair_tickets_update" ON public.repair_tickets;
DROP POLICY IF EXISTS "users_own_repair_tickets_delete" ON public.repair_tickets;

CREATE POLICY "users_own_repair_tickets_select" ON public.repair_tickets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_repair_tickets_insert" ON public.repair_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_repair_tickets_update" ON public.repair_tickets
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_repair_tickets_delete" ON public.repair_tickets
  FOR DELETE USING (auth.uid() = user_id);

-- 5. RLS Policies for repair_ticket_status_history
DROP POLICY IF EXISTS "users_own_repair_history_select" ON public.repair_ticket_status_history;
DROP POLICY IF EXISTS "users_own_repair_history_insert" ON public.repair_ticket_status_history;

CREATE POLICY "users_own_repair_history_select" ON public.repair_ticket_status_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_repair_history_insert" ON public.repair_ticket_status_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Trigger for updated_at on repair_tickets
DROP TRIGGER IF EXISTS update_repair_tickets_updated_at ON public.repair_tickets;
CREATE TRIGGER update_repair_tickets_updated_at
  BEFORE UPDATE ON public.repair_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
