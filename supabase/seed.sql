-- Supabase Seed Data for POS Mobile Phone Retail & Repair System
-- File: supabase/seed.sql

-- 1. Create Demo User in auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
  'authenticated',
  'authenticated',
  'demo@pos.com',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at,
  provider_id
) VALUES (
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
  format('{"sub":"%s","email":"demo@pos.com"}', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0')::jsonb,
  'email',
  now(),
  now(),
  now(),
  'demo@pos.com'
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- 2. User Roles & Profiles
INSERT INTO public.user_roles (user_id, role)
VALUES ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name)
VALUES ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'demo@pos.com', 'Demo Shop Admin')
ON CONFLICT (id) DO NOTHING;

-- 3. Settings
INSERT INTO public.settings (user_id, business_name, logo_url, tax_rate, currency_symbol, receipt_footer)
VALUES (
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
  'TechFix Mobile & Repairs',
  '',
  8.5,
  '$',
  'Thank you for choosing TechFix Mobile! All repair work includes a 90-day warranty.'
) ON CONFLICT (user_id) DO NOTHING;

-- 4. Categories
INSERT INTO public.categories (id, user_id, name, description, color) VALUES
('c1111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Smartphones', 'Brand new and certified pre-owned mobile phones', '#3b82f6'),
('c2222222-2222-2222-2222-222222222222', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Accessories', 'Cases, chargers, screen protectors, and powerbanks', '#10b981'),
('c3333333-3333-3333-3333-333333333333', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Replacement Parts', 'OLED displays, batteries, charging ports, and back glass', '#f59e0b'),
('c4444444-4444-4444-4444-444444444444', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Laptops & Tablets', 'iPads, Android tablets, and MacBooks', '#8b5cf6')
ON CONFLICT (id) DO NOTHING;

-- 5. Products
INSERT INTO public.products (id, user_id, category_id, name, description, barcode, retail_price, cost_price, stock_quantity, is_serialized, condition_grade, is_repair_part) VALUES
('11111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'c1111111-1111-1111-1111-111111111111', 'iPhone 15 Pro Max 256GB', 'Apple A17 Pro Chip, Titanium Frame, Action Button', '194253401234', 1199.99, 950.00, 5, true, 'new', false),
('22222222-2222-2222-2222-222222222222', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'c1111111-1111-1111-1111-111111111111', 'Samsung Galaxy S24 Ultra 512GB', 'Snapdragon 8 Gen 3, S-Pen, 200MP Camera', '887276501234', 1299.99, 1020.00, 3, true, 'new', false),
('33333333-3333-3333-3333-333333333333', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'c3333333-3333-3333-3333-333333333333', 'iPhone 13 OLED Screen Assembly', 'Premium Soft OLED replacement digitizer & touch panel', '712345001001', 129.99, 45.00, 14, false, 'new', true),
('44444444-4444-4444-4444-444444444444', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'c2222222-2222-2222-2222-222222222222', 'Apple 20W USB-C Power Adapter', 'Fast charging wall block for iPhone & iPad', '194253002002', 19.99, 6.50, 45, false, 'new', false),
('55555555-5555-5555-5555-555555555555', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'c2222222-2222-2222-2222-222222222222', 'Anker PowerBank 20000mAh', 'Dual USB-C 22.5W High Capacity Battery Pack', '848061003003', 49.99, 22.00, 18, false, 'new', false),
('66666666-6666-6666-6666-666666666666', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'c2222222-2222-2222-2222-222222222222', 'USB-C Braided Cable 2m', 'Nylon braided fast charging cable', '848061004004', 14.99, 3.20, 60, false, 'new', false),
('77777777-7777-7777-7777-777777777777', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'c4444444-4444-4444-4444-444444444444', 'iPad Air M2 11" 128GB Wi-Fi', 'Liquid Retina Display, Apple M2 chip', '194253005005', 599.99, 480.00, 4, true, 'new', false)
ON CONFLICT (id) DO NOTHING;

-- 6. Product Variants
INSERT INTO public.product_variants (id, user_id, product_id, variant_name, sku, price_adjustment, stock_quantity, is_active, is_serialized, condition_grade) VALUES
('a1111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '11111111-1111-1111-1111-111111111111', 'Natural Titanium', 'IP15PM-NT', 0.00, 3, true, true, 'new'),
('a2222222-2222-2222-2222-222222222222', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '11111111-1111-1111-1111-111111111111', 'Blue Titanium', 'IP15PM-BT', 0.00, 2, true, true, 'new')
ON CONFLICT (id) DO NOTHING;

-- 7. Device Identifiers (IMEIs)
INSERT INTO public.device_identifiers (id, user_id, product_id, product_variant_id, imei, serial_number, condition_grade, status, cost, sell_price) VALUES
('b1111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '356789012345678', 'DX15PM001', 'new', 'in_stock', 950.00, 1199.99),
('b2222222-2222-2222-2222-222222222222', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', '356789012345679', 'DX15PM002', 'new', 'in_stock', 950.00, 1199.99),
('b3333333-3333-3333-3333-333333333333', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '22222222-2222-2222-2222-222222222222', NULL, '990000862471831', 'R3CW80011', 'refurbished_a', 'in_stock', 850.00, 1099.99)
ON CONFLICT (id) DO NOTHING;

-- 8. Part Compatibility
INSERT INTO public.part_compatibility (id, user_id, product_id, device_model, notes) VALUES
('e1111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '33333333-3333-3333-3333-333333333333', 'iPhone 13', 'Full touch & TrueTone support'),
('e2222222-2222-2222-2222-222222222222', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '33333333-3333-3333-3333-333333333333', 'iPhone 13 Pro', 'Soft OLED display assembly')
ON CONFLICT (id) DO NOTHING;

-- 9. Customers
INSERT INTO public.customers (id, user_id, name, email, phone, address) VALUES
('f1111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'John Smith', 'john.smith@gmail.com', '+1 555-0147', '123 Main St, New York, NY'),
('f2222222-2222-2222-2222-222222222222', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Sarah Connor', 'sarah.connor@cyberdyne.io', '+1 555-0199', '456 Terminator Ave, Los Angeles, CA'),
('f3333333-3333-3333-3333-333333333333', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Michael Knight', 'michael@foundation.org', '+1 555-0188', '789 Knight Rider Blvd, Chicago, IL')
ON CONFLICT (id) DO NOTHING;

-- 10. Technicians
INSERT INTO public.technicians (id, user_id, name, email, phone, specialty, status) VALUES
('91111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Marcus Vance', 'marcus.vance@techfix.com', '+1 555-9011', 'Micro-soldering, Face ID & IC Repair', 'active'),
('92222222-2222-2222-2222-222222222222', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Elena Rostova', 'elena.r@techfix.com', '+1 555-9022', 'Screen & Battery Replacement, Water Damage', 'active')
ON CONFLICT (id) DO NOTHING;

-- 11. Repair Tickets
INSERT INTO public.repair_tickets (id, user_id, ticket_number, customer_id, device_name, serial_or_imei, issue_description, estimated_cost, deposit_paid, status, assigned_tech_id, notes) VALUES
('81111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'REP-1001', 'f1111111-1111-1111-1111-111111111111', 'iPhone 13 Pro Max', '351234567890123', 'Cracked front glass screen, touch unresponsive in upper right quadrant', 180.00, 50.00, 'in_repair', '91111111-1111-1111-1111-111111111111', 'Customer requested original color soft OLED screen.'),
('82222222-2222-2222-2222-222222222222', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'REP-1002', 'f2222222-2222-2222-2222-222222222222', 'Samsung Galaxy S22 Ultra', '991122334455667', 'Battery draining rapidly (under 2 hours) and phone gets hot during charging', 95.00, 20.00, 'ready_for_pickup', '92222222-2222-2222-2222-222222222222', 'Battery replaced and load testing completed.'),
('83333333-3333-3333-3333-333333333333', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'REP-1003', 'f3333333-3333-3333-3333-333333333333', 'Google Pixel 8 Pro', '359988776655443', 'Rear telephoto camera glass shattered & photos appear blurry', 120.00, 0.00, 'diagnosing', '91111111-1111-1111-1111-111111111111', 'Awaiting camera module inspection.')
ON CONFLICT (id) DO NOTHING;

-- 12. Repair Ticket Status History
INSERT INTO public.repair_ticket_status_history (id, repair_ticket_id, user_id, previous_status, new_status, changed_by, notes) VALUES
('71111111-1111-1111-1111-111111111111', '81111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', NULL, 'received', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Ticket logged at intake counter.'),
('72222222-2222-2222-2222-222222222222', '81111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'received', 'diagnosing', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Inspected glass damage.'),
('73333333-3333-3333-3333-333333333333', '81111111-1111-1111-1111-111111111111', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'diagnosing', 'in_repair', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Moved to workbench for OLED replacement.'),
('74444444-4444-4444-4444-444444444444', '82222222-2222-2222-2222-222222222222', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'in_repair', 'qc_testing', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Battery charge cycle testing passed.'),
('75555555-5555-5555-5555-555555555555', '82222222-2222-2222-2222-222222222222', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'qc_testing', 'ready_for_pickup', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Customer notified via SMS.')
ON CONFLICT (id) DO NOTHING;

-- 13. Repair Ticket Reserved Parts
INSERT INTO public.repair_ticket_parts (id, user_id, repair_ticket_id, product_id, quantity, unit_cost, unit_price, status) VALUES
('b4444444-4444-4444-4444-444444444444', 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '81111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 1, 45.00, 129.99, 'reserved')
ON CONFLICT (id) DO NOTHING;
