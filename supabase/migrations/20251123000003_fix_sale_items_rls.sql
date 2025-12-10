-- Add missing RLS policies for sale_items
-- This allows the sync service to update items if they already exist (handling 409 conflicts)

DROP POLICY IF EXISTS "Users can update sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Users can delete sale items" ON public.sale_items;

CREATE POLICY "Users can update sale items" ON public.sale_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);

CREATE POLICY "Users can delete sale items" ON public.sale_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);
