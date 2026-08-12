-- Migration: Phase 4 POS Checkout Adaptation
-- File: supabase/migrations/20260104000000_pos_checkout_adaptation.sql

-- Add device_identifier_id and repair_ticket_id columns to sale_items
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS device_identifier_id UUID REFERENCES public.device_identifiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repair_ticket_id UUID REFERENCES public.repair_tickets(id) ON DELETE SET NULL;
