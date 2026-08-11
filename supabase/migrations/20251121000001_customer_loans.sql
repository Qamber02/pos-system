-- Migration: Add Customer Loans Support
-- Created: 2025-11-21

-- Create customer_loans table
CREATE TABLE IF NOT EXISTS customer_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  loan_amount NUMERIC NOT NULL CHECK (loan_amount > 0),
  amount_paid NUMERIC DEFAULT 0 CHECK (amount_paid >= 0),
  remaining_balance NUMERIC GENERATED ALWAYS AS (loan_amount - amount_paid) STORED,
  loan_date TIMESTAMPTZ DEFAULT now(),
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid', 'overdue')),
  notes TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX idx_customer_loans_customer_id ON customer_loans(customer_id);
CREATE INDEX idx_customer_loans_user_id ON customer_loans(user_id);
CREATE INDEX idx_customer_loans_status ON customer_loans(status);
CREATE INDEX idx_customer_loans_due_date ON customer_loans(due_date) WHERE due_date IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE customer_loans ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customer_loans
CREATE POLICY "Users can view their own customer loans"
  ON customer_loans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own customer loans"
  ON customer_loans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own customer loans"
  ON customer_loans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own customer loans"
  ON customer_loans FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customer_loans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_loans_updated_at
  BEFORE UPDATE ON customer_loans
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_loans_updated_at();

-- Add trigger to auto-update status based on due date and payment
CREATE OR REPLACE FUNCTION update_loan_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If fully paid, mark as paid
  IF NEW.amount_paid >= NEW.loan_amount THEN
    NEW.status = 'paid';
  -- If overdue and not paid
  ELSIF NEW.due_date IS NOT NULL AND NEW.due_date < now() AND NEW.amount_paid < NEW.loan_amount THEN
    NEW.status = 'overdue';
  -- Otherwise active
  ELSIF NEW.amount_paid < NEW.loan_amount THEN
    NEW.status = 'active';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_loans_status_update
  BEFORE INSERT OR UPDATE ON customer_loans
  FOR EACH ROW
  EXECUTE FUNCTION update_loan_status();
