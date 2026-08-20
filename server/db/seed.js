/**
 * server/db/seed.js — Master Database Seeder.
 * Parses data/restaurants.csv, creates default users, and populates the Turso database.
 */

const fs = require('node:fs');
const path = require('node:path');
const Papa = require('papaparse');
const bcrypt = require('bcryptjs');
const { getDB, queryOne, queryAll, execute, execScript } = require('./index');

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')        // Replace spaces with -
    .replace(/[^\w\-]+/g, '')   // Remove all non-word chars
    .replace(/\-\-+/g, '-');    // Replace multiple - with single -
}

async function seedDatabase(force = false) {
  console.log('[MenuScan DB] Starting database seeding...');

  // Initialize schema first
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await execScript(schemaSql);
    console.log('[MenuScan DB] Schema initialized.');
  }

  // Check if restaurants already exist
  const countRow = await queryOne('SELECT COUNT(*) as cnt FROM restaurants');
  const existingCount = countRow?.cnt || 0;
  if (existingCount > 0 && !force) {
    console.log(`[MenuScan DB] Database already contains ${existingCount} restaurants. Skipping seed.`);
    return true;
  }

  // 1. Create Default Users with hashed passwords
  console.log('[MenuScan DB] Creating default administrative & owner accounts...');
  const salt = bcrypt.genSaltSync(10);
  const adminPassHash = bcrypt.hashSync('admin123', salt);
  const ownerPassHash = bcrypt.hashSync('owner123', salt);

  // Clear existing if force
  if (force) {
    await execute('DELETE FROM analytics_events');
    await execute('DELETE FROM orders');
    await execute('DELETE FROM qr_codes');
    await execute('DELETE FROM menu_items');
    await execute('DELETE FROM categories');
    await execute('DELETE FROM menus');
    await execute('DELETE FROM restaurant_users');
    await execute('DELETE FROM restaurants');
    await execute('DELETE FROM users');
  }

  // Insert Super Admin
  await execute(`
    INSERT OR REPLACE INTO users (id, name, email, password_hash, role, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `, ['USR_ADMIN', 'Platform Administrator', 'admin@menuscan.com', adminPassHash, 'SUPER_ADMIN', 'ACTIVE']);

  // Insert Restaurant Owner Accounts
  const ownerAccounts = [
    { id: 'USR_OWNER_1', name: 'Spice Garden Manager', email: 'owner1@menuscan.com', restId: 'R001' },
    { id: 'USR_OWNER_2', name: 'Dragon Palace Manager', email: 'owner2@menuscan.com', restId: 'R002' },
    { id: 'USR_OWNER_3', name: 'La Bella Italia Manager', email: 'owner3@menuscan.com', restId: 'R003' },
    { id: 'USR_OWNER_4', name: 'Burger Barn Manager', email: 'owner4@menuscan.com', restId: 'R004' }
  ];

  for (const oa of ownerAccounts) {
    await execute(`
      INSERT OR REPLACE INTO users (id, name, email, password_hash, role, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [oa.id, oa.name, oa.email, ownerPassHash, 'RESTAURANT_OWNER', 'ACTIVE']);
  }

  // 2. Parse CSV
  const csvPath = path.join(__dirname, '../../data/restaurants.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('[MenuScan DB] CSV file not found at:', csvPath);
    return false;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
    transform: v => (typeof v === 'string' ? v.trim() : v)
  });

  const rows = parseResult.data.filter(r => r.restaurant_id && r.item_id);
  console.log(`[MenuScan DB] Parsed ${rows.length} rows from restaurants.csv`);

  const restaurantMap = new Map();
  const menuMap = new Map();
  const categoryMap = new Map();

  // First pass: extract restaurants
  rows.forEach(r => {
    const rid = r.restaurant_id;
    if (!restaurantMap.has(rid)) {
      const slug = slugify(r.restaurant_name);
      restaurantMap.set(rid, {
        id: rid,
        name: r.restaurant_name,
        slug: slug,
        tagline: r.restaurant_tagline || '',
        themeColor: r.restaurant_theme_color || '#6c63ff',
        accentColor: r.restaurant_accent_color || '#a855f7',
        logoUrl: r.image_url || '',
        logoEmoji: r.restaurant_logo_emoji || '🍽️',
        cuisine: r.restaurant_cuisine || 'Multi-Cuisine',
        rating: parseFloat(r.restaurant_rating) || 4.5,
        address: r.restaurant_address || '',
        phone: r.restaurant_phone || '',
        openTime: r.open_time || '11:00 AM',
        closeTime: r.close_time || '11:00 PM',
        menuId: r.menu_id || `MENU_${rid}`
      });
    }
  });

  // Insert Restaurants, Menus, QR Codes, and map Owner users
  for (const [rid, rest] of restaurantMap.entries()) {
    await execute(`
      INSERT OR REPLACE INTO restaurants (
        id, name, slug, tagline, theme_color, accent_color, logo_url, logo_emoji,
        cuisine, rating, address, phone, open_time, close_time, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      rest.id, rest.name, rest.slug, rest.tagline, rest.themeColor, rest.accentColor,
      rest.logoUrl, rest.logoEmoji, rest.cuisine, rest.rating, rest.address, rest.phone,
      rest.openTime, rest.closeTime, 'ACTIVE'
    ]);

    // Insert published Main Menu
    await execute(`
      INSERT OR REPLACE INTO menus (id, restaurant_id, name, description, status, version)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [rest.menuId, rest.id, 'Main Menu', `Official digital menu for ${rest.name}`, 'PUBLISHED', 1]);

    // Insert Default Table QR Code
    await execute(`
      INSERT OR REPLACE INTO qr_codes (id, restaurant_id, menu_id, identifier, label, table_number, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [`QR_${rest.id}`, rest.id, rest.menuId, rest.id, `General Table QR — ${rest.name}`, '', 'ACTIVE']);

    // Link assigned owner user if matching
    const assignedOwner = ownerAccounts.find(oa => oa.restId === rest.id);
    if (assignedOwner) {
      await execute(`
        INSERT OR REPLACE INTO restaurant_users (id, restaurant_id, user_id, role)
        VALUES (?, ?, ?, ?)
      `, [`RU_${rest.id}_${assignedOwner.id}`, rest.id, assignedOwner.id, 'OWNER']);
    }
  }

  // Second pass: Insert Categories and Menu Items
  let catIndex = 1;
  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const rid = r.restaurant_id;
    const catName = r.category || 'Main Course';
    const catKey = `${rid}_${catName}`;

    let catId = categoryMap.get(catKey);
    if (!catId) {
      catId = `CAT_${rid}_${String(catIndex++).padStart(3, '0')}`;
      categoryMap.set(catKey, catId);

      const menuId = restaurantMap.get(rid)?.menuId || `MENU_${rid}`;
      await execute(`
        INSERT OR REPLACE INTO categories (id, menu_id, name, description, display_order, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [catId, menuId, catName, `${catName} selections`, catIndex, 'ACTIVE']);
    }

    // Insert Menu Item
    const isVeg = r.is_vegetarian === 'true' || r.is_vegetarian === true || r.is_vegetarian === '1' ? 1 : 0;
    const isAvail = r.is_available === 'false' || r.is_available === false || r.is_available === '0' ? 0 : 1;
    const isBs = r.is_bestseller === 'true' || r.is_bestseller === true || r.is_bestseller === '1' ? 1 : 0;

    await execute(`
      INSERT OR REPLACE INTO menu_items (
        id, category_id, restaurant_id, name, description, price, currency,
        image_url, image_alt_text, emoji, is_vegetarian, is_available, is_bestseller,
        spice_level, display_order, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      r.item_id, catId, rid, r.item_name, r.description || '', parseFloat(r.price) || 0,
      r.currency || '₹', r.image_url || '', `${r.item_name} culinary presentation`,
      r.item_emoji || '🍽️', isVeg, isAvail, isBs, r.spice_level || 'None', idx + 1, 'ACTIVE'
    ]);
  }

  console.log(`[MenuScan DB] Seeding completed successfully!`);
  console.log(`[MenuScan DB] Initialized ${restaurantMap.size} restaurants, ${categoryMap.size} categories, and ${rows.length} dishes.`);
  return true;
}

if (require.main === module) {
  seedDatabase(true).then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  });
}

module.exports = { seedDatabase, slugify };
