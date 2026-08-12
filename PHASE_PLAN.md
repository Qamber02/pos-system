# Phase Plan: Mobile Repair Shop Management System

## Phase 1 — Core Schema Extension: Devices & Parts

**Goal:** Establish the fundamental data structures for tracking serialized devices (IMEIs) and mapping repair parts to compatible device models.

**Depends on:** none

**Schema changes:** 
- New tables: `device_identifiers` (IMEI/serial, status, cost, owner_id linked to customers), `part_compatibility` (junction between product/variant and device_model).
- `products` / `product_variants`: Add `condition_grade` (enum) and `is_serialized` (boolean) columns.
- Migration file: `supabase/migrations/20260101000000_core_schema_devices_parts.sql` (timestamp approximated)

**Dexie changes:** 
- Add `CachedDeviceIdentifier` and `CachedPartCompatibility` interfaces to `src/lib/db.ts`.
- Add them to the `OfflineDatabase` class and index definitions.
- Hook them into `src/lib/syncService.ts`.

**Files touched:** 
- `supabase/migrations/*_core_schema_devices_parts.sql` (new)
- `src/lib/db.ts`
- `src/lib/syncService.ts`
- `src/types/database.types.ts` (if manually maintained)

**UI touchpoints:** 
- Products/Inventory settings: A minimal toggle to mark a product as "Serialized" or "Repair Part".
- Minimal list view to see registered IMEIs.

**Acceptance criteria:** 
- Can create a new product marked as serialized.
- Can insert a `device_identifier` (IMEI) linked to a product.
- Dexie successfully syncs the new tables locally and pushes to Supabase.

**Verification steps:** 
- Run `npx tsc --noEmit` and ensure 0 errors.
- Create a row via UI, check IndexedDB via browser dev tools, verify it syncs to local Supabase.
- Verify RLS policies block unauthorized users in Supabase Studio.

**Explicit non-goals for this phase:** 
- Do not build the full trade-in intake UI.
- Do not touch the POS checkout flow.
- Do not build the repair ticketing system.

**Commit message:** 
`feat: phase 1 - core schema extension for serialized devices and parts compatibility`

---

## Phase 2 — Repair Ticket Module Core

**Goal:** Build the basic ticketing system to log repair jobs, assign a device to a ticket, and move it through the standard status workflow.

**Depends on:** Phase 1

**Schema changes:** 
- New tables: `repair_tickets` (customer_id, device_identifier_id, issue, status, estimated_cost), `repair_ticket_status_history` (audit log of status changes).
- Status Enum: Received, Diagnosing, Awaiting Approval, Approved, Declined, Awaiting Parts, In Repair, QC/Testing, Ready for Pickup, Completed, Unrepairable/Cancelled.
- Migration file: `supabase/migrations/20260102000000_repair_tickets.sql`

**Dexie changes:** 
- Add `CachedRepairTicket` and `CachedRepairTicketHistory` to `src/lib/db.ts` and `syncService.ts`.

**Files touched:** 
- `supabase/migrations/*_repair_tickets.sql` (new)
- `src/lib/db.ts`
- `src/lib/syncService.ts`
- `src/pages/RepairTickets.tsx` (new)
- `src/components/repair/*` (new)

**UI touchpoints:** 
- New "Repairs" route.
- Ticket creation form (select customer, select/enter device, enter issue).
- Kanban-style or simple list view of active tickets by status.
- Ticket detail view with a button to update status.

**Acceptance criteria:** 
- Can create a new ticket linked to a customer and a device.
- Can move the ticket through all 8+ stages sequentially or jump stages.
- Every status change automatically creates an immutable log entry in the history table.

**Verification steps:** 
- Run `npx tsc --noEmit`.
- Manually create a ticket, change status 3 times, verify 3 rows appear in `repair_ticket_status_history` in local Supabase.

**Explicit non-goals for this phase:** 
- Do not attach consumable parts to the ticket yet (that's Phase 3).
- Do not handle POS checkout/payment for the ticket (that's Phase 4).

**Commit message:** 
`feat: phase 2 - repair ticketing system and workflow engine`

---

## Phase 3 — Parts Reservation & Technician Assignment

**Goal:** Allow shop staff to assign technicians to tickets and reserve specific repair parts out of sellable inventory when a job begins.

**Depends on:** Phase 2

**Schema changes:** 
- New tables: `repair_ticket_parts` (junction: ticket_id, product_variant_id, qty, cost, status: reserved/consumed/returned), `technicians` (maps to profiles.id, tracks active ticket count).
- Migration file: `supabase/migrations/20260103000000_ticket_parts_technicians.sql`

**Dexie changes:** 
- Add `CachedRepairTicketPart` and `CachedTechnician` to `db.ts` and `syncService.ts`.
- Complex logic: Reserving a part must decrement `stock_quantity` on the local `product_variants` table immediately to prevent double-selling.

**Files touched:** 
- `supabase/migrations/*_ticket_parts_technicians.sql` (new)
- `src/lib/db.ts`
- `src/lib/syncService.ts`
- `src/pages/RepairTickets.tsx` (modified)
- `src/components/repair/TicketPartsList.tsx` (new)

**UI touchpoints:** 
- Ticket detail view: Add "Assign Technician" dropdown.
- Ticket detail view: Add "Attach Parts" searchable list (filtered by `part_compatibility` ideally).

**Acceptance criteria:** 
- Can assign a technician to a ticket.
- Can attach an LCD screen to a ticket; the screen's available stock drops by 1 immediately across the app.
- Removing a part from a ticket restores the stock quantity.

**Verification steps:** 
- Run `npx tsc --noEmit`.
- Check initial stock of Part A. Attach to ticket. Verify stock is N-1. Check POS screen, verify it shows N-1.

**Explicit non-goals for this phase:** 
- Do not build reporting around technician load.

**Commit message:** 
`feat: phase 3 - repair parts reservation and technician assignment`

---

## Phase 4 — POS Checkout Adaptation

**Goal:** Modify the existing Point of Sale checkout to handle a mixed cart containing standard retail items, serialized devices, and finalized repair tickets.

**Depends on:** Phase 1, Phase 2, Phase 3

**Schema changes:** 
- `sale_items`: Add nullable `device_identifier_id` and nullable `repair_ticket_id`.
- Migration file: `supabase/migrations/20260104000000_pos_checkout_adaptation.sql`

**Dexie changes:** 
- Update `CachedSaleItem` interface to include new optional fields.

**Files touched:** 
- `supabase/migrations/*_pos_checkout_adaptation.sql` (new)
- `src/lib/db.ts`
- `src/pages/POS.tsx` (modified)
- `src/components/pos/Cart.tsx` (modified)

**UI touchpoints:** 
- POS search bar must now resolve IMEIs directly to the specific device.
- New POS button: "Pull Completed Repair" to load a ticket's outstanding balance into the cart as a line item.

**Acceptance criteria:** 
- A single cart can ring up: 1x USB Cable, 1x iPhone (via IMEI scan), and 1x Screen Repair payout.
- Completing the sale marks the device IMEI as 'sold' and the repair ticket as 'completed/paid'.

**Verification steps:** 
- Run `npx tsc --noEmit`.
- Checkout a mixed cart. Verify the device status in Supabase changes to 'sold'.

**Explicit non-goals for this phase:** 
- Do not build warranty logic.

**Commit message:** 
`feat: phase 4 - unified pos checkout for devices and repairs`

---

## Phase 5 — Warranty & Trade-in/Buyback

**Goal:** Manage warranty policies for sales/repairs and handle the structured intake of used devices from customers.

**Depends on:** Phase 4

**Schema changes:** 
- New tables: `warranty_records` (type, start_date, end_date, terms, sale_item_id, repair_ticket_id), `trade_in_intake` (customer_id, checklist_json, offered_price, resulting_device_id).
- Migration file: `supabase/migrations/20260105000000_warranty_tradein.sql`

**Dexie changes:** 
- Add `CachedWarrantyRecord` and `CachedTradeInIntake` to `db.ts` and `syncService.ts`.

**Files touched:** 
- `supabase/migrations/*_warranty_tradein.sql` (new)
- `src/lib/db.ts`, `syncService.ts`
- `src/pages/TradeIn.tsx` (new)
- UI components for Warranty generation on checkout/repair completion.

**UI touchpoints:** 
- Dedicated Trade-In screen (condition checklist, pricing).
- Receipt view showing warranty terms.

**Acceptance criteria:** 
- Completing a used device trade-in logs the intake and generates a new in-stock `device_identifier` ready to be sold.
- A repair ticket completion generates a 30-day warranty record linked to the job.

**Verification steps:** 
- Run `npx tsc --noEmit`.
- Complete a trade-in, verify new IMEI is available in POS.

**Explicit non-goals for this phase:** 
- Do not build the unified search UI.

**Commit message:** 
`feat: phase 5 - warranty tracking and trade-in intake`

---

## Phase 6 — Customer & Device History Search

**Goal:** Provide the front counter with a single pane of glass to look up a customer or IMEI and see their entire lifecycle across the shop.

**Depends on:** Phase 1-5

**Schema changes:** 
- None (purely a read/view layer combining existing tables).

**Dexie changes:** 
- Complex queries across `customers`, `device_identifiers`, `sales`, and `repair_tickets`.

**Files touched:** 
- `src/pages/CustomerHistory.tsx` (new or modified)
- `src/components/history/DeviceTimeline.tsx` (new)

**UI touchpoints:** 
- Global search bar or dedicated page where entering a Phone Number or IMEI brings up a timeline.
- Timeline shows: Phone bought -> Screen broke -> Repair job -> Warranty claim.

**Acceptance criteria:** 
- Searching an IMEI shows its original sale date, any repair tickets associated with it, and current warranty status.

**Verification steps:** 
- Run `npx tsc --noEmit`.
- Click-through test to verify all related records resolve correctly offline.

**Explicit non-goals for this phase:** 
- Do not add reporting/analytics.

**Commit message:** 
`feat: phase 6 - unified customer and device lifecycle history`

---

## Phase 7 — Supplier & Purchase Orders

**Goal:** Track inventory acquisition from suppliers to manage wholesale parts and device stock levels accurately.

**Depends on:** Phase 1

**Schema changes:** 
- New tables: `suppliers`, `purchase_orders`, `purchase_order_items`.
- Migration file: `supabase/migrations/20260107000000_suppliers_pos.sql`

**Dexie changes:** 
- Add `CachedSupplier`, `CachedPurchaseOrder`, `CachedPurchaseOrderItem` to `db.ts` and `syncService.ts`.

**Files touched:** 
- `supabase/migrations/*_suppliers_pos.sql` (new)
- `src/lib/db.ts`, `syncService.ts`
- `src/pages/PurchaseOrders.tsx` (new)

**UI touchpoints:** 
- PO creation screen.
- PO receiving screen (where IMEIs are scanned in for serialized items, or bulk stock is incremented).

**Acceptance criteria:** 
- Can create a PO to a supplier.
- Receiving the PO correctly increments `product_variants` stock OR generates new `device_identifiers` records.

**Verification steps:** 
- Run `npx tsc --noEmit`.
- Receive a PO with 5 screens, verify bulk stock +5.
- Receive a PO with 2 phones, verify 2 new IMEIs exist.

**Explicit non-goals for this phase:** 
- Do not modify checkout.

**Commit message:** 
`feat: phase 7 - suppliers and purchase orders`

---

## Phase 8 — Reporting Dashboard

**Goal:** Give management visibility into margins, turnaround times, and technician efficiency.

**Depends on:** Phase 1-7

**Schema changes:** 
- None (or possibly Supabase views, but local reporting is preferred for offline-first).

**Dexie changes:** 
- Complex aggregate queries across all local tables.

**Files touched:** 
- `src/pages/Dashboard.tsx` (modified)
- `src/components/reports/*` (new)

**UI touchpoints:** 
- Charts/tables for: Repair turnaround time, margin by category (devices vs parts vs labor), stock valuation, technician load.

**Acceptance criteria:** 
- Dashboard renders accurately based purely on local Dexie data (works offline).

**Verification steps:** 
- Run `npx tsc --noEmit`.
- Create a test repair, verify turnaround time metric updates.

**Commit message:** 
`feat: phase 8 - comprehensive analytics and reporting dashboard`

---

## Phase 9 (Stretch) — Notifications

**Goal:** Automate customer communication (SMS/WhatsApp) on ticket status changes.

**Depends on:** Phase 2

**Schema changes:** 
- None (logic tier only).

**Acceptance criteria:** 
- Moving a ticket to "Ready for Pickup" triggers an outbound notification. (Needs a backend Edge Function or third-party API integration, breaking pure offline capability for this specific feature).

---

## Phase 10 (Stretch) — Multi-branch

**Goal:** Support Gwadar and Turbat branches with cross-branch stock transfers.

**Depends on:** All phases

**Schema changes:** 
- Introduce `branch_id` across almost all tables, breaking the current `user_id` = tenant assumption.
- Massive RLS and Dexie indexing rewrite.

**Acceptance criteria:** 
- User logged into Gwadar can see Turbat's stock but only sell from Gwadar. Can initiate an inventory transfer between branches.
