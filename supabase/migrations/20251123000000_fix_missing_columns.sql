-- Fix missing columns in product_variants
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Fix missing columns in customer_loans
ALTER TABLE public.customer_loans 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;
