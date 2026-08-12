# Gap Analysis: POS System to Mobile Repair Shop Management System

## 1. Executive Summary

The current `pos-system` is built as a highly capable retail point-of-sale system with a robust offline-first architecture (Dexie + Supabase local). It currently supports products, variants, sales, categories, customers, and customer loans.

However, to transition into a full **Mobile Phone + Hardware/Accessories + LCD Screen + Repair Shop Management System**, the system needs to expand beyond simple SKU-based retail inventory into:
1. **Serialized Inventory Tracking** (IMEIs/Serials for specific physical units).
2. **Repair Ticketing & Workflows** (Multi-stage state machine for repairs).
3. **Parts Management** (Condition grading and device model compatibility mapping).
4. **Unified Transactions** (Mixing retail goods, serialized goods, and repair services in one POS checkout).

## 2. Current State (Schema Audit)

Based on the `PROJECT_STATE.md`, `src/lib/db.ts`, and the 23 SQL migrations, the current active tables are:
- `profiles` (User management and roles)
- `products` (Base catalog items with barcode/category)
- `categories` (Hierarchy for products)
- `product_variants` (SKU-level stock tracking, price adjustments)
- `customers` (Basic CRM)
- `customer_loans` (Debt and ledger tracking)
- `sales` (Order headers)
- `sale_items` (Order line items linked to products and variants)
- `held_carts` (Suspended transaction states)
- `settings` (App configuration)

**Key Finding:** The current schema strictly treats inventory as bulk (count-based). There is no concept of a "unique physical item" (like a specific phone with an IMEI), no service ticketing, no part compatibility, and no purchase ordering.

## 3. Gap Analysis by Module

### 3.1 Unified Catalog & Inventory
- **Current:** `products` and `product_variants` handle bulk stock.
- **Gap:** 
  - Need `device_identifiers` to track individual phones (IMEI, serial, status: in-stock/sold/repair/scrapped, acquisition source, cost, owner).
  - Need a way to denote a product as a "repair part" with a "grade/condition" field (OEM, aftermarket, etc.).
  - Need `part_compatibility` (many-to-many junction) mapping a part/variant to specific device models.

### 3.2 Repair / Service Ticketing
- **Current:** Completely absent.
- **Gap:** 
  - Need `repair_tickets` table (customer, device, issues, estimated cost, assigned tech, status).
  - Need `repair_ticket_status_history` for an append-only audit log of stage transitions.
  - Need `repair_ticket_parts` (junction table) to handle *immediate* stock reservation of parts consumed during a repair.
  - Need `technicians` (could be an extension of `profiles` or a separate table mapping to `profiles.id`).

### 3.3 Customer & Device History
- **Current:** `customers` tracks basic info and loans.
- **Gap:** 
  - The UI needs a unified view that queries `device_identifiers`, `sales`, and `repair_tickets` to show the full lifecycle of a customer's devices (sales and repairs combined).

### 3.4 Warranty & Returns
- **Current:** No warranty tracking.
- **Gap:** 
  - Need `warranty_records` linked polymorphically (or via sparse foreign keys) to `sale_items` (for sales) or `repair_tickets` (for repair jobs), including start/end dates and terms.

### 3.5 Trade-in / Buyback
- **Current:** No intake flow for used items.
- **Gap:** 
  - Need `trade_in_intake` table to handle the checklist, grading, and valuation process, which eventually creates a `device_identifiers` record when accepted.

### 3.6 Sales / POS Checkout
- **Current:** `sale_items` link to `product_id` and `variant_id`.
- **Gap:** 
  - `sale_items` needs to support linking to a `device_identifier_id` (for selling a specific phone).
  - `sale_items` needs to support linking to a `repair_ticket_id` (for paying out a completed repair job).

### 3.7 Supplier & Purchase Orders
- **Current:** No supplier or PO management.
- **Gap:** 
  - Need `suppliers`, `purchase_orders`, and `purchase_order_items` tables to track inventory acquisition and register IMEIs at receiving time.

## 4. Architectural Constraints & Considerations

1. **Offline-First (Dexie Sync):** Every single new table identified above (`device_identifiers`, `repair_tickets`, `part_compatibility`, etc.) MUST have a corresponding interface and Table definition in `src/lib/db.ts`, and be registered in the `syncService.ts` sync queue. This is a non-trivial amount of boilerplate per table.
2. **Row Level Security (RLS):** The current system relies on strict multi-tenant user isolation. All new tables must implement the standard RLS pattern (`user_id` column, policies for `user`, `admin`, `developer`, `restricted`).
3. **Multi-branch (Stretch Goal):** The current schema isolates by `user_id`, which likely represents a single shop/tenant. True multi-branch might require a `branch_id` concept, which would be a massive structural change. We will assume a single branch for the MVP phases, as requested.
