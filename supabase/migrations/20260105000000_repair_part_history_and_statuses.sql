-- ====================================================================
-- MIGRATION: Phase 2 — Part Statuses & Audit Trail
-- ====================================================================

-- 1. Update check constraint on repair_ticket_parts status
ALTER TABLE public.repair_ticket_parts 
  DROP CONSTRAINT IF EXISTS repair_ticket_parts_status_check;

ALTER TABLE public.repair_ticket_parts 
  ADD CONSTRAINT repair_ticket_parts_status_check 
  CHECK (status IN ('reserved', 'consumed', 'returned', 'broken', 'returned_to_supplier'));

-- 2. Add status_reason and status_updated_at columns to repair_ticket_parts
ALTER TABLE public.repair_ticket_parts
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Create repair_ticket_part_history table for part-level audit trail
CREATE TABLE IF NOT EXISTS public.repair_ticket_part_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_ticket_part_id UUID NOT NULL REFERENCES public.repair_ticket_parts(id) ON DELETE CASCADE,
  repair_ticket_id UUID NOT NULL REFERENCES public.repair_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS & Policies
ALTER TABLE public.repair_ticket_part_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_part_history_select" ON public.repair_ticket_part_history;
DROP POLICY IF EXISTS "users_own_part_history_insert" ON public.repair_ticket_part_history;

CREATE POLICY "users_own_part_history_select" ON public.repair_ticket_part_history 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_part_history_insert" ON public.repair_ticket_part_history 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_part_history_ticket ON public.repair_ticket_part_history(repair_ticket_id);
CREATE INDEX IF NOT EXISTS idx_part_history_part ON public.repair_ticket_part_history(repair_ticket_part_id);
