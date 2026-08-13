-- ====================================================================
-- MIGRATION: Phase 3 — Products & Accessories in Repair Tickets
-- ====================================================================

ALTER TABLE public.repair_ticket_parts
  ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'part' CHECK (item_type IN ('part', 'product'));
