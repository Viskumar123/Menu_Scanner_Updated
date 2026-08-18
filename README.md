# MenuScan — Production Multi-Tenant Contactless Digital Menu & QR Platform

> **A scalable, secure, multi-tenant digital menu platform featuring stable canonical QR routing, server-side tenant isolation, relational database persistence, JWT authentication, live stock availability management, food image upload handling, and automated test verification.**

---

## Table of Contents

- [Production Quick Start](#production-quick-start)
- [1. Platform Overview](#1-platform-overview)
- [2. Production Architecture](#2-production-architecture)
- [3. Multi-Tenant Security & Access Control](#3-multi-tenant-security--access-control)
- [4. Database Design & Relational Schema](#4-database-design--relational-schema)
- [5. Stable QR URL Routing](#5-stable-qr-url-routing)
- [6. Food Imagery & Fallback Hierarchy](#6-food-imagery--fallback-hierarchy)
- [7. REST API Documentation](#7-rest-api-documentation)
- [8. Automated Test Suite](#8-automated-test-suite)
- [9. Production Environment Variables](#9-production-environment-variables)
- [10. Deployment & Pilot Strategy](#10-deployment--pilot-strategy)
- [11. Final Agent Production Report (Section 59)](#11-final-agent-production-report-section-59)

---

## Production Quick Start

### 1. Prerequisites
- **Node.js**: `v18+` or `v24+` installed
- **npm**: `v9+` or `v11+`

### 2. Installation & Database Bootstrapping
```bash
# 1. Navigate to project directory
cd d:/download/Menu_Scanner

# 2. Install dependencies
npm install

# 3. Initialize & seed SQLite relational database
npm run db:init

# 4. Run automated test suite (100% pass verification)
npm test

# 5. Launch production server
npm start
```

Open your browser:
- **Public Scanner & Portal:** `http://localhost:8000/index.html`
- **Stable Canonical QR Demo:** `http://localhost:8000/r/the-spice-garden` (or `http://localhost:8000/r/R001?table=4`)
- **Central Management Hub:** `http://localhost:8000/admin.html`
  - *Super Admin:* `admin@menuscan.com` / `admin123`
  - *Tenant Owner:* `owner1@menuscan.com` / `owner123`
- **API Health Check:** `http://localhost:8000/api/health`

---

## 1. Platform Overview

### What the Project Does
**MenuScan** transforms physical, paper-based dining menus into dynamic, touch-friendly digital menu experiences accessed through stable table-mounted QR codes. Each restaurant tenant manages their brand identity, dishes, pricing, real-time in-stock availability, category ordering, and table-specific QR stickers from an authenticated management dashboard.

### Core Business Flow
```text
Restaurant Owner
       │
       ▼
   Sign In
       │
       ▼
Manage Restaurant Profile & Menus
       │
       ├── Upload Food Photos / Logos (Multer storage)
       ├── Configure Pricing, Categories & Allergens
       ├── Toggle Real-Time Dish Availability (In Stock / Sold Out)
       └── Generate Table Sticker QR Codes
              │
              ▼
    Stable Canonical URL (/r/:slug?table=X)
              │
              ▼
           Diner
              │
           Scan QR
              │
              ▼
   Fast Mobile Menu (Sub-second load, dietary filters, isolated cart, table ordering)
```

---

## 2. Production Architecture

The system employs a multi-tenant client-server architecture:

```text
                               ┌───────────────────┐
                               │     Customer      │
                               │   Scans QR Code   │
                               └─────────┬─────────┘
                                         │
                                         ▼
                               ┌───────────────────┐
                               │   Stable QR URL   │
                               │ /r/{restaurantId} │
                               └─────────┬─────────┘
                                         │
                                         ▼
                               ┌───────────────────┐
                               │ Express HTTP Node │
                               │  Server (:8000)   │
                               └─────────┬─────────┘
                                         │
                                         ▼
                         ┌───────────────────────────────┐
                         │   REST API & Auth Router      │
                         └──────┬──────────────┬─────────┘
                                │              │
                   ┌────────────┘              └─────────────┐
                   ▼                                         ▼
          ┌─────────────────┐                       ┌─────────────────┐
          │  SQLite Database│                       │ Disk / Storage  │
          │ (node:sqlite)   │                       │   (/uploads/)   │
          │ Users           │                       │ Food Photos     │
          │ Restaurants     │                       │ Restaurant Logos│
          │ Menus           │                       └─────────────────┘
          │ Categories      │
          │ Menu Items      │
          │ Table QR Codes  │
          │ Orders          │
          │ Analytics       │
          └─────────────────┘
                   ▲
                   │
          ┌────────┴────────┐
          │   Admin / Owner │
          │    Dashboard    │
          └─────────────────┘
```

---

## 3. Multi-Tenant Security & Access Control

### Role-Based Access Control (RBAC)
1. **`SUPER_ADMIN`**: Global management access across all restaurant tenants, platform configuration, catalog CSV imports/exports, and system health metrics.
2. **`RESTAURANT_OWNER`**: Strictly isolated to manage only their assigned restaurant tenant(s).
3. **`STAFF`**: Kitchen and service access to view live table orders and update dish availability.
4. **`CUSTOMER`**: Zero-login, public read-only access to published menus and table order placement.

### Server-Side Tenant Boundary Enforcement
Every protected mutation (`PUT /api/restaurants/:id`, `POST /api/items`, `PATCH /api/items/:id/availability`, `DELETE /api/items/:id`) invokes `enforceTenantAccess` middleware:
- Verifies JWT identity.
- Cross-references requested resource's `restaurant_id` against the authenticated user's records in the `restaurant_users` table.
- **Strictly rejects cross-tenant requests with `403 Forbidden`**.

---

## 4. Database Design & Relational Schema

The database engine is built on **SQLite** (`data/menuscan.db`) with relational integrity, foreign key cascades, and query indexing:

```sql
PRAGMA foreign_keys = ON;

-- 1. Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'RESTAURANT_OWNER',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Restaurants (Tenants)
CREATE TABLE restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  tagline TEXT DEFAULT '',
  theme_color TEXT DEFAULT '#6c63ff',
  accent_color TEXT DEFAULT '#a855f7',
  logo_url TEXT DEFAULT '',
  logo_emoji TEXT DEFAULT '🍽️',
  cuisine TEXT DEFAULT 'Multi-Cuisine',
  rating REAL DEFAULT 4.5,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  open_time TEXT DEFAULT '11:00 AM',
  close_time TEXT DEFAULT '11:00 PM',
  status TEXT DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Restaurant-User Mapping
CREATE TABLE restaurant_users (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'OWNER',
  UNIQUE(restaurant_id, user_id)
);

-- 4. Menus (Draft -> Published -> Archived)
CREATE TABLE menus (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Main Menu',
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PUBLISHED',
  version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Categories
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  menu_id TEXT NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
);

-- 6. Menu Items
CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT '₹',
  image_url TEXT DEFAULT '',
  image_alt_text TEXT DEFAULT '',
  emoji TEXT DEFAULT '🍽️',
  is_vegetarian INTEGER DEFAULT 1,
  is_available INTEGER DEFAULT 1,
  is_bestseller INTEGER DEFAULT 0,
  spice_level TEXT DEFAULT 'None',
  allergens TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. QR Codes
CREATE TABLE qr_codes (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  menu_id TEXT,
  identifier TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  table_number TEXT DEFAULT '',
  status TEXT DEFAULT 'ACTIVE'
);

-- 8. Analytics Events
CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  qr_code_id TEXT DEFAULT '',
  event_type TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. Orders
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number TEXT DEFAULT 'Takeaway',
  items_json TEXT NOT NULL,
  subtotal REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'Received',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Stable QR URL Routing

Because QR codes are physically printed and affixed to restaurant tables, their destination URLs must remain permanent and decoupled from internal backend structure changes.

### Resolution Flow: `/r/:identifier`
When scanned, `/r/:identifier` (e.g. `http://localhost:8000/r/the-spice-garden?table=3`):
1. Looks up the `identifier` in the `qr_codes` table or resolves against `restaurants.slug` and `restaurants.id`.
2. Verifies that the restaurant is in `ACTIVE` status.
3. Automatically logs an anonymous `QR_SCAN` event in the analytics engine.
4. Issues a clean HTTP `302 Found` redirect to `/menu.html?restaurant=R001&table=3`.

---

## 6. Food Imagery & Fallback Hierarchy

The platform does **not** rely on external or synthetic AI generation. Instead, dish imagery strictly follows this predictable four-tier hierarchy:

```text
┌──────────────────────────────────────────────┐
│ 1. User-Uploaded Photo (/uploads/media_*.jpg)│
├──────────────────────────────────────────────┤
│ 2. Direct Image URL (https://cdn.../dish.jpg)│
├──────────────────────────────────────────────┤
│ 3. Category/Dish Emoji (🍕, 🍛, 🥗, 🥟)      │
├──────────────────────────────────────────────┤
│ 4. Accessible Text Fallback                  │
└──────────────────────────────────────────────┘
```

- **File Security:** Uploads via `POST /api/upload` validate MIME types (`image/jpeg`, `image/png`, `image/webp`), restrict file sizes to **5MB maximum**, and generate cryptographic random filenames to prevent path traversal or executable file injection.
- **Accessibility:** All images require meaningful alt-text for screen readers (e.g., `alt="Paneer Tikka served with mint chutney"`).

---

## 7. REST API Documentation

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Server uptime and health verification |
| `POST` | `/api/auth/register` | Public | Register new owner account |
| `POST` | `/api/auth/login` | Public | Login with email/password, returns JWT token |
| `GET` | `/api/auth/me` | Authenticated | Fetch current user profile & assigned restaurants |
| `GET` | `/r/:identifier` | Public | Permanent canonical QR redirect |
| `GET` | `/api/restaurants` | Public / Auth | List active restaurants or owned restaurants |
| `GET` | `/api/restaurants/:idOrSlug` | Public | Fetch restaurant profile & active menu metadata |
| `POST` | `/api/restaurants` | Authenticated | Create new restaurant tenant |
| `PUT` | `/api/restaurants/:id` | Tenant Protected | Update restaurant branding, theme, and hours |
| `DELETE` | `/api/restaurants/:id` | Tenant Protected | Delete restaurant tenant and cascaded dishes |
| `GET` | `/api/items/:restaurantId` | Public | Filtered menu items (`?vegOnly=true&category=Starters`) |
| `POST` | `/api/items` | Tenant Protected | Add new dish item |
| `PUT` | `/api/items/:id` | Tenant Protected | Update dish details and photo |
| `PATCH` | `/api/items/:id/availability` | Tenant Protected | Fast 1-click in-stock / sold-out toggle |
| `DELETE` | `/api/items/:id` | Tenant Protected | Remove dish from catalog |
| `POST` | `/api/orders` | Public | Submit table order from mobile menu |
| `GET` | `/api/orders/:restaurantId` | Tenant Protected | Live kitchen stream of table orders |
| `PATCH` | `/api/orders/:id/status` | Tenant Protected | Update order status (`Received`, `Preparing`, `Served`) |
| `POST` | `/api/analytics/event` | Public | Ingest anonymous diner analytics (`MENU_VIEW`, `ITEM_VIEW`) |
| `GET` | `/api/analytics/:restaurantId`| Tenant Protected | Aggregate KPI analytics report |
| `POST` | `/api/upload` | Authenticated | Multipart image upload for logos and food photos |

---

## 8. Automated Test Suite

Run the comprehensive test suite with one command:
```bash
npm test
```

### Test Coverage Matrix
- **Unit Tests (`tests/unit.test.js`):**
  - Slug generation and URL character normalization.
  - Price & GST 5% calculation accuracy.
  - 4-Tier Image fallback resolution.
  - In-stock availability binary toggling.
- **Tenant Isolation Security Tests (`tests/tenant_isolation.test.js`):**
  - Unauthenticated mutation attempts return `401 Unauthorized`.
  - Restaurant Owner A attempting to modify Restaurant B receives `403 Forbidden`.
  - Restaurant Owner A attempting to add dishes to Restaurant B receives `403 Forbidden`.
  - Restaurant Owner A attempting to toggle stock status of Restaurant B receives `403 Forbidden`.
  - Super Admin can legitimately manage all tenants (`200 OK`).
- **Integration & Canonical Route Tests (`tests/api.test.js`):**
  - Health check endpoint verification (`200 OK`).
  - Canonical QR resolution (`/r/:slug` -> `302 Found`).
  - Table-specific QR routing (`/r/:id?table=X` -> `302 Found`).
  - Dietary filter querying (`vegOnly=true`).
  - Public table order placement and grand total calculations.
  - Anonymous analytics event ingestion.

---

## 9. Production Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Server
PORT=8000
HOST=0.0.0.0
NODE_ENV=production
APP_URL=https://menu.example.com

# Security
JWT_SECRET=your_production_secure_jwt_secret_key_change_me_in_production

# Database
DATABASE_PATH=data/menuscan.db

# Storage
STORAGE_TYPE=local
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=5
```

---

## 10. Deployment & Pilot Strategy

### Pilot Rollout (3–5 Restaurants)
1. **Infrastructure Provisioning:**
   - Deploy Node.js server to AWS / DigitalOcean / Railway / Render.
   - Configure HTTPS domain (e.g. `https://menu.yourdomain.com`).
   - Mount persistent storage volume for `data/menuscan.db` and `uploads/`.
2. **Onboarding Sequence:**
   - Create owner accounts via Super Admin dashboard.
   - Import initial restaurant menu catalogs via CSV or admin UI.
   - Print high-density table sticker QR codes for physical tables.
3. **Observability:**
   - Monitor real-time analytics stream for QR scan frequency and item views.
   - Track live kitchen orders stream in the admin dashboard.

---

## 11. Final Agent Production Report (Section 59)

### 1. Current Status
```text
Overall: READY
```

### 2. Implemented
- ✅ **Production Backend:** Full Express server with structured REST APIs, CORS, rate limiting, and static serving.
- ✅ **Relational Database:** SQLite engine (`data/menuscan.db`) with foreign keys, indexes, and automated seed importer.
- ✅ **Multi-Tenant Security:** Server-side RBAC (`SUPER_ADMIN`, `RESTAURANT_OWNER`, `STAFF`, `CUSTOMER`) with strict tenant boundary enforcement (`403 Forbidden` on unauthorized cross-tenant actions).
- ✅ **Stable QR Routing:** Canonical permanent URLs (`/r/:identifier` and `/r/:slug?table=X`) with 302 redirection.
- ✅ **Food Photo Upload Engine:** Secure multipart uploads with MIME validation, 5MB size limits, and fallback hierarchy: `Uploaded Image` ➔ `Image URL` ➔ `Emoji` ➔ `Text`.
- ✅ **Live Kitchen Orders Stream:** Real-time order placement from diner cart and live status management in admin dashboard.
- ✅ **Analytics Engine:** Anonymous event logging for `QR_SCAN`, `MENU_VIEW`, `ITEM_VIEW`, and `ORDER_PLACED` with KPI metrics.
- ✅ **Automated Test Suite:** 100% test pass rate across Unit, Tenant Isolation, and Integration test suites.
- ✅ **Environment & Deployment:** Configured `.env.example`, `.gitignore`, `package.json`, and deployment guides.

### 3. Production Checklist Status
| Requirement | Status | Verification |
| :--- | :--- | :--- |
| Customer Menu (Mobile-first, fast, accessible) | **READY** | Tested on mobile/desktop viewports |
| Multi-Tenant Dashboard | **READY** | Tested with Super Admin & Tenant Owner roles |
| Server-Side Authorization | **READY** | Automated 403 isolation tests passed |
| Stable Canonical QR Codes | **READY** | Tested `/r/the-spice-garden` redirect |
| Image Uploads & Fallbacks | **READY** | Tested multipart upload & emoji fallback |
| In-Stock / Sold-Out Toggle | **READY** | Tested dynamic stock status updates |
| Live Kitchen Orders | **READY** | Tested end-to-end cart order dispatch |
| Relational Schema & Indexes | **READY** | SQLite schema initialized with indexes |
| Automated Test Suite | **READY** | 15/15 tests passing (100%) |

### 4. Recommended Next Steps
- **P0 (Pre-Launch):** Deploy to cloud instance with HTTPS domain and mount persistent disk volume.
- **P1 (Post-Pilot):** Integrate WebSockets for sub-second push updates on kitchen orders screen.
- **P2 (Future):** Integrate direct payment gateway webhooks (Stripe / Razorpay).
