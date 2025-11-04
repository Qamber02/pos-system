-- Insert sample categories
INSERT INTO public.categories (name, description, color, user_id) VALUES
('Beverages', 'Drinks and refreshments', '#3B82F6', (SELECT id FROM auth.users LIMIT 1)),
('Snacks', 'Quick bites and snacks', '#10B981', (SELECT id FROM auth.users LIMIT 1)),
('Dairy', 'Milk and dairy products', '#F59E0B', (SELECT id FROM auth.users LIMIT 1)),
('Bakery', 'Fresh baked goods', '#EF4444', (SELECT id FROM auth.users LIMIT 1)),
('Groceries', 'Essential grocery items', '#8B5CF6', (SELECT id FROM auth.users LIMIT 1))
ON CONFLICT DO NOTHING;

-- Insert sample products
INSERT INTO public.products (name, description, barcode, retail_price, cost_price, stock_quantity, low_stock_threshold, category_id, user_id) VALUES
-- Beverages
('Coca Cola 500ml', 'Chilled soft drink', '1001', 80, 55, 50, 10, (SELECT id FROM categories WHERE name = 'Beverages' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Pepsi 500ml', 'Chilled soft drink', '1002', 80, 55, 45, 10, (SELECT id FROM categories WHERE name = 'Beverages' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Mineral Water 1.5L', 'Pure drinking water', '1003', 50, 30, 100, 20, (SELECT id FROM categories WHERE name = 'Beverages' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Pakola 250ml', 'Ice cream soda', '1004', 60, 40, 30, 10, (SELECT id FROM categories WHERE name = 'Beverages' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Mango Juice 200ml', 'Fresh mango juice', '1005', 90, 60, 25, 10, (SELECT id FROM categories WHERE name = 'Beverages' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),

-- Snacks
('Lays Chips', 'Salted potato chips', '2001', 50, 30, 60, 15, (SELECT id FROM categories WHERE name = 'Snacks' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Kurkure', 'Spicy snack', '2002', 40, 25, 55, 15, (SELECT id FROM categories WHERE name = 'Snacks' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Bisconni Chocolatto', 'Chocolate biscuits', '2003', 35, 22, 70, 20, (SELECT id FROM categories WHERE name = 'Snacks' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Sooper Biscuit', 'Cream biscuits', '2004', 30, 18, 80, 20, (SELECT id FROM categories WHERE name = 'Snacks' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Prince Biscuit', 'Chocolate biscuits', '2005', 30, 18, 75, 20, (SELECT id FROM categories WHERE name = 'Snacks' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),

-- Dairy
('Olpers Milk 1L', 'Fresh milk', '3001', 280, 250, 30, 10, (SELECT id FROM categories WHERE name = 'Dairy' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Nestle Everyday 400g', 'Tea whitener', '3002', 380, 350, 25, 8, (SELECT id FROM categories WHERE name = 'Dairy' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Tarang Yogurt', 'Plain yogurt', '3003', 120, 90, 40, 12, (SELECT id FROM categories WHERE name = 'Dairy' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Dairy Milk Chocolate', 'Milk chocolate bar', '3004', 180, 140, 35, 10, (SELECT id FROM categories WHERE name = 'Dairy' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),

-- Bakery
('Brown Bread', 'Whole wheat bread', '4001', 110, 85, 20, 8, (SELECT id FROM categories WHERE name = 'Bakery' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('White Bread', 'Fresh white bread', '4002', 100, 75, 25, 8, (SELECT id FROM categories WHERE name = 'Bakery' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Rusk', 'Tea rusk', '4003', 150, 110, 30, 10, (SELECT id FROM categories WHERE name = 'Bakery' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Cake Rusk', 'Sweet cake rusk', '4004', 180, 140, 22, 8, (SELECT id FROM categories WHERE name = 'Bakery' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),

-- Groceries
('Cooking Oil 1L', 'Vegetable oil', '5001', 450, 410, 40, 12, (SELECT id FROM categories WHERE name = 'Groceries' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Rice 1kg', 'Basmati rice', '5002', 280, 250, 50, 15, (SELECT id FROM categories WHERE name = 'Groceries' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Sugar 1kg', 'White sugar', '5003', 150, 130, 45, 15, (SELECT id FROM categories WHERE name = 'Groceries' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Salt 800g', 'Iodized salt', '5004', 50, 35, 60, 20, (SELECT id FROM categories WHERE name = 'Groceries' LIMIT 1), (SELECT id FROM auth.users LIMIT 1)),
('Tea 475g', 'Black tea leaves', '5005', 480, 440, 28, 10, (SELECT id FROM categories WHERE name = 'Groceries' LIMIT 1), (SELECT id FROM auth.users LIMIT 1))
ON CONFLICT DO NOTHING;

-- Update default settings to use PKR currency
UPDATE public.settings 
SET currency_symbol = 'PKR' 
WHERE currency_symbol = '$';