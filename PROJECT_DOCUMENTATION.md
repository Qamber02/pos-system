# Project Documentation: Retail Zen 92 (POS Shopping)

## 1. Project Overview

**Project Name**: `pos-shopping` (Retail Zen 92)
**Type**: Modern Point of Sale (POS) System
**Core Philosophy**: Offline-First, Cloud-Synced, Secure User Isolation.

This application is a robust Point of Sale system designed for retail environments. It functions primarily as a desktop application (via Electron) but is built with web technologies (React). It prioritizes reliability through an offline-first architecture, ensuring that sales can continue even without an internet connection, while seamlessly synchronizing data with the cloud (Supabase) when connectivity is restored.

### Technology Stack

*   **Frontend Framework**: React 18 (Vite)
*   **Language**: TypeScript
*   **UI Components**: Radix UI, Tailwind CSS, Framer Motion, Lucide React.
*   **State Management**: React Query (Tanstack Query) for server state, React Context/Hooks for local state.
*   **Local Database (Offline)**: Dexie.js (IndexedDB wrapper).
*   **Cloud Backend**: Supabase (PostgreSQL, Auth, Realtime).
*   **Desktop Wrapper**: Electron.
*   **Form Handling**: React Hook Form + Zod Validation.
*   **Utilities**: `date-fns` (Dates), `xlsx` (Excel Export), `recharts` (Analytics).

---

## 2. System Architecture

### 2.1. Offline-First Data Strategy
The system uses a **Dual-Database Architecture**:
1.  **Local (Primary)**: `Dexie.js` (IndexedDB) stores all data locally in the browser/Electron storage. The UI reads/writes *only* to this local database, ensuring zero-latency interactions.
2.  **Remote (Secondary)**: Supabase (PostgreSQL) acts as the central source of truth and backup.

### 2.2. Synchronization Engine (`SyncService`)
A custom `SyncService` manages data consistency between Local and Remote DBs.
*   **Push (Local -> Cloud)**:
    *   Operations (`insert`, `update`, `delete`) are written to a local `syncQueue` table in Dexie.
    *   The service processes this queue, pushing changes to Supabase.
    *   **Conflict Resolution**: Uses "Last Write Wins" or attempts updates on duplicate key errors.
*   **Pull (Cloud -> Local)**:
    *   **Delta Sync**: Fetches only records where `updated_at` > local `lastModified` timestamp.
    *   This minimizes bandwidth usage and speeds up sync.
*   **Entities Synced**: Products, Categories, Customers, Settings, Product Variants, Customer Loans.

### 2.3. Database Schema (Supabase)
The database is normalized and uses UUIDs for primary keys.
*   **Core Tables**: `products`, `categories`, `customers`, `sales`, `sale_items`.
*   **Features**: `product_variants`, `customer_loans`, `held_carts`.
*   **System**: `settings`, `profiles`.

---

## 3. Security Analysis

### 3.1. Current Security Measures
*   **Authentication**: Managed via Supabase Auth. Users must be logged in to sync data.
*   **Authorization (RLS)**: **High Security**.
    *   Row Level Security (RLS) is enabled on ALL tables.
    *   Policies strictly enforce `auth.uid() = user_id`. This ensures **Complete User Isolation**—User A cannot see, edit, or delete User B's data, even if they manipulate the API client.
    *   *Reference*: `supabase/migrations/20251123120000_complete_user_isolation.sql`
*   **Input Validation**: Zod schemas are used throughout the application to validate user input before it reaches the database or logic layers.

### 3.2. Security Recommendations (Step-by-Step)
1.  **Environment Variables**: Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correctly set. While Anon keys are public, RLS protects the data.
2.  **Sensitive Data**: Avoid storing sensitive customer PII (Personally Identifiable Information) like full credit card numbers. The schema currently stores basic info (Phone, Email, Address) which is acceptable for a POS.
3.  **Audit Logging**:
    *   *Current*: Basic `updated_at` timestamps.
    *   *Future*: Implement a `logs` table to track sensitive actions (e.g., deleting a sale, changing stock manually).
4.  **Rate Limiting**: Supabase handles basic API rate limiting. For the app, ensure the `SyncService` doesn't spam the API (it currently has a 30s interval).

---

## 4. Performance & Efficiency

### 4.1. Current Efficiency
*   **Zero-Latency UI**: Because the UI reads from IndexedDB, page loads and searches are instantaneous, regardless of network speed.
*   **Optimized Sync**: The "Delta Sync" approach (checking `lastModified`) is highly efficient compared to fetching the full dataset every time.
*   **Bundle Size**: Vite provides efficient tree-shaking.

### 4.2. Performance Bottlenecks & Solutions
*   **Large Datasets**: If a user has 10,000+ products, rendering them in a list can be slow.
    *   *Solution*: Implement **Virtualization** (e.g., `react-window`) for product lists and sales history.
*   **Sync Queue Buildup**: If offline for days, the `syncQueue` could grow large.
    *   *Solution*: Batch sync requests (e.g., send 50 items at a time) instead of one-by-one to reduce HTTP overhead.
*   **Image Optimization**: If product images are added, they should be resized/compressed before upload to Supabase Storage.

---

## 5. Future Scope

### 5.1. Feature Expansion
1.  **Multi-Store / Multi-Terminal Support**:
    *   Currently, the system is "Single User = Single Store".
    *   *Upgrade*: Add `store_id` to tables to allow multiple employees (terminals) to sync to the same store account.
2.  **Advanced Analytics**:
    *   Predictive inventory (AI-based stock warnings).
    *   Customer retention analysis (Cohorts).
3.  **Loyalty Program**:
    *   Points system based on `sales` total.
    *   Redeem points for discounts.
4.  **E-commerce Integration**:
    *   Sync products to a Shopify/WooCommerce store.

### 5.2. Technical Improvements
1.  **Automated Testing**: Expand `vitest` coverage. Currently, it seems minimal. Add E2E tests (Playwright) for critical flows like "Checkout".
2.  **CI/CD**: Set up GitHub Actions to automatically build the Electron app on push.

---

## 6. Step-by-Step Implementation Guide (Maintenance)

### Step 1: Security Audit (Weekly)
- [ ] Check Supabase RLS policies (ensure no "public" access policies were accidentally added).
- [ ] Review `npm audit` for vulnerable dependencies.
- [ ] Rotate database passwords if multiple developers access the project.

### Step 2: Performance Tuning (Monthly)
- [ ] Run Lighthouse audit on the web build.
- [ ] Check Dexie.js database size. If >50MB, consider archiving old sales locally.
- [ ] Monitor Supabase query performance (add indexes to `user_id` and `updated_at` columns if not already present).

### Step 3: Code Quality
- [ ] Run `npm run lint` before every commit.
- [ ] Ensure all new database tables have corresponding Zod schemas and TypeScript interfaces.
