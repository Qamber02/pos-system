-- ====================================================================
-- MIGRATION: Phase 4 — Unified Refund System
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  repair_ticket_id UUID REFERENCES public.repair_tickets(id) ON DELETE SET NULL,
  refund_number TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  refund_type TEXT DEFAULT 'product' CHECK (refund_type IN ('product', 'service', 'deposit')),
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'store_credit', 'other')),
  reason TEXT NOT NULL,
  restock_item BOOLEAN DEFAULT false,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS & Policies
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_refunds_select" ON public.refunds;
DROP POLICY IF EXISTS "users_own_refunds_insert" ON public.refunds;

CREATE POLICY "users_own_refunds_select" ON public.refunds FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_refunds_insert" ON public.refunds FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_refunds_user_id ON public.refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_refunds_repair_ticket_id ON public.refunds(repair_ticket_id);
CREATE INDEX IF NOT EXISTS idx_refunds_sale_id ON public.refunds(sale_id);
