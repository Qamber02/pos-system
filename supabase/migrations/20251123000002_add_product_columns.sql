-- Add missing columns to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Create index for barcode if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
