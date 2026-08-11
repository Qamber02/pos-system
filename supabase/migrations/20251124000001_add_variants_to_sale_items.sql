-- Add variant fields to sale_items table
ALTER TABLE sale_items 
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id),
ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- Add index for variant_id for better performance
CREATE INDEX IF NOT EXISTS idx_sale_items_variant_id ON sale_items(variant_id);
