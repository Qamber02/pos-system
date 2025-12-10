-- ADD MISSING COLUMNS TO MATCH APP SCHEMA
-- Run this in Supabase SQL Editor

-- Add barcode column to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Add any other missing columns for sales table
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS change_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add missing columns for sale_items
ALTER TABLE public.sale_items
ADD COLUMN IF NOT EXISTS product_name TEXT,
ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2);

-- Verify changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND table_schema = 'public'
ORDER BY ordinal_position;
