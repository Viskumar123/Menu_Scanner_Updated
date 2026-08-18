-- ═══════════════════════════════════════════════════════════════════
-- MenuScan Platform Production Relational Database Schema
-- Multi-Tenant Architecture with Role-Based Access Control
-- ═══════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- 1. Users Table (Super Admins, Restaurant Owners, Staff)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'RESTAURANT_OWNER', -- 'SUPER_ADMIN', 'RESTAURANT_OWNER', 'STAFF'
  status TEXT NOT NULL DEFAULT 'ACTIVE',          -- 'ACTIVE', 'SUSPENDED', 'PENDING'
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Restaurants Table (Tenants)
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,                            -- e.g. R001
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,                      -- e.g. the-spice-garden (for stable URLs)
  tagline TEXT DEFAULT '',
  theme_color TEXT DEFAULT '#6c63ff',
  accent_color TEXT DEFAULT '#a855f7',
  logo_url TEXT DEFAULT '',
  logo_emoji TEXT DEFAULT '🍽️',
  cuisine TEXT NOT NULL DEFAULT 'Multi-Cuisine',
  rating REAL DEFAULT 4.5,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  open_time TEXT DEFAULT '11:00 AM',
  close_time TEXT DEFAULT '11:00 PM',
  status TEXT NOT NULL DEFAULT 'ACTIVE',          -- 'ACTIVE', 'INACTIVE', 'SUSPENDED'
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Restaurant Users (Multi-tenant ownership mapping)
CREATE TABLE IF NOT EXISTS restaurant_users (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OWNER',             -- 'OWNER', 'MANAGER', 'STAFF'
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(restaurant_id, user_id)
);

-- 4. Menus Table (Lifecycle: Draft -> Preview -> Published -> Archived)
CREATE TABLE IF NOT EXISTS menus (
  id TEXT PRIMARY KEY,                            -- e.g. MENU_R001
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Main Menu',
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PUBLISHED',       -- 'DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'
  version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- 5. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  menu_id TEXT NOT NULL,
  name TEXT NOT NULL,                             -- e.g. 'Starters', 'Main Course'
  description TEXT DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',          -- 'ACTIVE', 'HIDDEN', 'ARCHIVED'
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE
);

-- 6. Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,                            -- e.g. I001
  category_id TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '₹',
  image_url TEXT DEFAULT '',
  image_alt_text TEXT DEFAULT '',
  emoji TEXT DEFAULT '🍽️',
  is_vegetarian INTEGER NOT NULL DEFAULT 1,       -- 1 = true, 0 = false
  is_available INTEGER NOT NULL DEFAULT 1,        -- 1 = in stock, 0 = sold out
  is_bestseller INTEGER NOT NULL DEFAULT 0,       -- 1 = true, 0 = false
  spice_level TEXT NOT NULL DEFAULT 'None',       -- 'None', 'Mild', 'Medium', 'Hot'
  allergens TEXT DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',          -- 'ACTIVE', 'ARCHIVED'
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- 7. QR Codes Table
CREATE TABLE IF NOT EXISTS qr_codes (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  menu_id TEXT,
  identifier TEXT UNIQUE NOT NULL,                -- e.g. 'R001', 'R001_T5'
  label TEXT NOT NULL,                            -- e.g. 'Table 5 Sticker'
  table_number TEXT DEFAULT '',                   -- e.g. '5'
  status TEXT NOT NULL DEFAULT 'ACTIVE',          -- 'ACTIVE', 'DISABLED'
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- 8. Analytics Events Table (Anonymous Product Analytics)
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  qr_code_id TEXT DEFAULT '',
  event_type TEXT NOT NULL,                       -- 'QR_SCAN', 'MENU_VIEW', 'ITEM_VIEW', 'ORDER_PLACED'
  metadata TEXT DEFAULT '{}',                     -- JSON payload: { table, itemId, referrer, etc. }
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- 9. Table Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,                            -- e.g. ORD489210
  restaurant_id TEXT NOT NULL,
  table_number TEXT DEFAULT 'Takeaway',
  items_json TEXT NOT NULL,                       -- JSON array of order items
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Received',        -- 'Received', 'Preparing', 'Served', 'Cancelled'
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- ─── Indexes for High-Performance Queries ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_categories_menu ON categories(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_users_user ON restaurant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_identifier ON qr_codes(identifier);
CREATE INDEX IF NOT EXISTS idx_analytics_restaurant ON analytics_events(restaurant_id, event_type);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id, created_at);
