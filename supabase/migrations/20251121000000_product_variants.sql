-- Migration: Add Product Variants Support
-- Created: 2025-11-21

-- Create product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  sku TEXT,
  price_adjustment NUMERIC DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_user_id ON product_variants(user_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_variants
CREATE POLICY "Users can view their own product variants"
  ON product_variants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own product variants"
  ON product_variants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own product variants"
  ON product_variants FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own product variants"
  ON product_variants FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_product_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_product_variants_updated_at();
