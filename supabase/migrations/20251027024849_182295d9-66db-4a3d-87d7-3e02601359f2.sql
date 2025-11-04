-- Add UPDATE policy for sale_items table
CREATE POLICY "Users can update sale items"
ON public.sale_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM sales
    WHERE sales.id = sale_items.sale_id
    AND sales.user_id = auth.uid()
  )
);

-- Add DELETE policy for sale_items table
CREATE POLICY "Users can delete sale items"
ON public.sale_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM sales
    WHERE sales.id = sale_items.sale_id
    AND sales.user_id = auth.uid()
  )
);