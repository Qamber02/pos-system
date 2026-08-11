# POS Shopping System — Project State Documentation

**Last Updated:** August 11, 2026  
**Repository:** [github.com/Qamber02/pos-system](https://github.com/Qamber02/pos-system.git)  
**Branch:** `main`

---

## 1. Executive Summary

The **POS Shopping System** is an offline-first, high-performance Point of Sale (POS) application built for retail environments. It provides real-time barcode scanning, inventory and variant management, customer loan tracking, staff role management, and continuous background synchronization between local storage (IndexedDB) and a PostgreSQL database (Supabase).

---

## 2. Technology Stack

- **Frontend Framework:** React 19 + TypeScript + Vite
- **UI & Styling:** TailwindCSS + Shadcn UI (Radix primitives) + Lucide Icons
- **Offline Storage:** Dexie.js (IndexedDB wrapper)
- **Backend / Database:** Supabase Local Instance (PostgreSQL 15, PostgREST, GoTrue Auth, Storage)
- **Deployment Targets:** Web SPA (Vite) + Desktop Application (Electron)

---

## 3. Local Infrastructure & Environment Configuration

### Server Endpoints & Ports

Local Supabase is fully running and healthy on custom ports:

| Service | Protocol / URL | Port |
|---|---|---|
| **Vite Dev Web App** | `http://localhost:8080` | `8080` |
| **Supabase REST API / Auth** | `http://127.0.0.1:54331` | `54331` |
| **PostgreSQL Database** | `postgresql://postgres:postgres@127.0.0.1:54332/postgres` | `54332` |
| **PostgreSQL Shadow DB** | `127.0.0.1` | `54333` |
| **Supabase Studio Dashboard** | `http://127.0.0.1:54334` | `54334` |
| **Local SMTP / Mailpit** | `http://127.0.0.1:54335` | `54335` |

### Environment Setup (`.env` vs `.env.example`)

- **`.env`**: Excluded from git repository via `.gitignore`.
  ```env
  VITE_SUPABASE_PROJECT_ID="vtizzxraiqqnfuookzip"
  VITE_SUPABASE_URL="http://127.0.0.1:54331"
  VITE_SUPABASE_PUBLISHABLE_KEY="<local_anon_key>"
  ```
- **`.env.example`**: Committed as a template for developers cloning the project.

---

## 4. Authentication Flow (No Email OTP Required)

- **Supabase Auth Config (`supabase/config.toml`)**:
  - `[auth.email] enable_confirmations = false`
  - `[auth.sms] enable_confirmations = false`
- **Frontend Auth Behavior (`src/pages/Auth.tsx`)**:
  - Direct login upon account creation without email verification or OTP steps.
  - Automatically provisions a local `userProfile` record in IndexedDB and triggers `syncService.syncAll()`.

---

## 5. Database Schema & Migration Architecture

All 23 SQL migrations in `supabase/migrations/` have been made idempotent:

1. **`profiles`**: User profiles with roles (`user`, `admin`, `developer`, `restricted`) and `status`.
2. **`products` & `categories`**: Main catalog items with barcode index and full category hierarchy.
3. **`product_variants`**: Stock variants with SKUs, price adjustments, and stock levels.
4. **`customers` & `customer_loans`**: Debt tracking and payment ledgers with calculated remaining balances.
5. **`sales` & `sale_items`**: Completed order records with variant support.
6. **`held_carts`**: Suspended transactions for quick retrieval.
7. **Row-Level Security (RLS)**: Enforces complete multi-tenant user isolation while permitting admin and developer overrides.

---

## 6. Offline Synchronization (`src/lib/syncService.ts`)

- **Offline-First Paradigm**: All user actions execute instantly against IndexedDB (`src/lib/db.ts`).
- **Background Sync**: Changes are pushed to Supabase when network connectivity is detected.
- **Conflict Handling**: Built-in HTTP 409 conflict resolution and delta sync logic.

---

## 7. Version Control & Repository State

- **Clean History**: Replaced legacy commit history with a clean initial commit (`feat: initial commit for POS Shopping system`).
- **Secrets Management**: Removed `.env` and `.temp` artifacts from git tracking.
- **Git Remote**: Configured to `git@github.com:Qamber02/pos-system.git`.

---

## 8. Verification & Build Commands

- **TypeScript Type Check**: `npx tsc --noEmit` (0 errors)
- **Local Dev Server**: `npm run dev`
- **Local Supabase Management**:
  - Start: `npx supabase start`
  - Stop: `npx supabase stop`
  - Reset DB: `npx supabase db reset`
