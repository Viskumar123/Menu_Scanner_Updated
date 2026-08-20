/**
 * server/routes/restaurants.routes.js — Multi-Tenant Restaurant Profile & Management.
 */

const express = require('express');
const router = express.Router();
const { queryOne, queryAll, execute } = require('../db');
const { requireAuth, optionalAuth, requireRole } = require('../middleware/auth');
const { enforceTenantAccess } = require('../middleware/tenant');

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

// GET /api/restaurants (Public list or user's restaurants)
router.get('/', optionalAuth, async (req, res) => {
  if (req.user && req.user.role === 'SUPER_ADMIN') {
    const all = await queryAll('SELECT * FROM restaurants ORDER BY name ASC');
    return res.json({ success: true, count: all.length, restaurants: all });
  }

  if (req.user && req.user.role === 'RESTAURANT_OWNER') {
    const owned = await queryAll(`
      SELECT r.*, ru.role as user_role
      FROM restaurant_users ru
      JOIN restaurants r ON r.id = ru.restaurant_id
      WHERE ru.user_id = ?
      ORDER BY r.name ASC
    `, [req.user.id]);
    return res.json({ success: true, count: owned.length, restaurants: owned });
  }

  // Public directory: active restaurants only
  const publicList = await queryAll(`
    SELECT id, name, slug, tagline, theme_color, accent_color, logo_url, logo_emoji,
           cuisine, rating, address, phone, open_time, close_time
    FROM restaurants
    WHERE status = 'ACTIVE'
    ORDER BY name ASC
  `);
  res.json({ success: true, count: publicList.length, restaurants: publicList });
});

// GET /api/restaurants/:idOrSlug
router.get('/:idOrSlug', async (req, res) => {
  const param = req.params.idOrSlug;
  const restaurant = await queryOne(`
    SELECT * FROM restaurants
    WHERE id = ? OR slug = ?
  `, [param, param]);

  if (!restaurant) {
    return res.status(404).json({ success: false, error: 'Restaurant not found.' });
  }

  // Get active menu
  const menu = await queryOne(`
    SELECT * FROM menus
    WHERE restaurant_id = ? AND status = 'PUBLISHED'
    ORDER BY version DESC LIMIT 1
  `, [restaurant.id]) || await queryOne('SELECT * FROM menus WHERE restaurant_id = ? LIMIT 1', [restaurant.id]);

  res.json({
    success: true,
    restaurant,
    activeMenu: menu
  });
});

// POST /api/restaurants (Create New Tenant - SUPER_ADMIN ONLY)
router.post('/', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  const {
    name, tagline = '', cuisine = 'Multi-Cuisine', themeColor = '#6c63ff',
    accentColor = '#a855f7', logoEmoji = '🍽️', logoUrl = '',
    address = '', phone = '', openTime = '11:00 AM', closeTime = '11:00 PM'
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Restaurant name is required.' });
  }

  // Generate unique ID & Slug
  const countRow = await queryOne('SELECT COUNT(*) as cnt FROM restaurants');
  const count = countRow?.cnt || 0;
  const newId = `R${String(count + 1).padStart(3, '0')}`;
  let baseSlug = slugify(name);
  let slug = baseSlug;
  let sCount = 1;
  while (await queryOne('SELECT id FROM restaurants WHERE slug = ?', [slug])) {
    slug = `${baseSlug}-${++sCount}`;
  }

  const menuId = `MENU_${newId}`;

  // Insert Restaurant
  await execute(`
    INSERT INTO restaurants (
      id, name, slug, tagline, theme_color, accent_color, logo_url, logo_emoji,
      cuisine, rating, address, phone, open_time, close_time, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `, [newId, name.trim(), slug, tagline, themeColor, accentColor, logoUrl, logoEmoji, cuisine, 4.5, address, phone, openTime, closeTime]);

  // Insert Default Menu
  await execute(`
    INSERT INTO menus (id, restaurant_id, name, description, status, version)
    VALUES (?, ?, ?, ?, 'PUBLISHED', 1)
  `, [menuId, newId, 'Main Menu', `Menu for ${name}`]);

  // Insert Default QR Code
  await execute(`
    INSERT INTO qr_codes (id, restaurant_id, menu_id, identifier, label, table_number, status)
    VALUES (?, ?, ?, ?, ?, '', 'ACTIVE')
  `, [`QR_${newId}`, newId, menuId, newId, `General Table QR — ${name}`]);

  // Link Owner
  await execute(`
    INSERT INTO restaurant_users (id, restaurant_id, user_id, role)
    VALUES (?, ?, ?, 'OWNER')
  `, [`RU_${newId}_${req.user.id}`, newId, req.user.id]);

  const created = await queryOne('SELECT * FROM restaurants WHERE id = ?', [newId]);

  res.status(201).json({
    success: true,
    restaurant: created
  });
});

// PUT /api/restaurants/:id
router.put('/:id', requireAuth, enforceTenantAccess, async (req, res) => {
  const id = req.params.id;
  const existing = await queryOne('SELECT * FROM restaurants WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Restaurant not found.' });
  }

  const {
    name = existing.name,
    tagline = existing.tagline,
    cuisine = existing.cuisine,
    themeColor = existing.theme_color,
    accentColor = existing.accent_color,
    logoEmoji = existing.logo_emoji,
    logoUrl = existing.logo_url,
    address = existing.address,
    phone = existing.phone,
    openTime = existing.open_time,
    closeTime = existing.close_time,
    status = existing.status
  } = req.body;

  let slug = existing.slug;
  if (name !== existing.name) {
    slug = slugify(name);
    let sCount = 1;
    while (await queryOne('SELECT id FROM restaurants WHERE slug = ? AND id != ?', [slug, id])) {
      slug = `${slugify(name)}-${++sCount}`;
    }
  }

  await execute(`
    UPDATE restaurants SET
      name = ?, slug = ?, tagline = ?, cuisine = ?, theme_color = ?, accent_color = ?,
      logo_emoji = ?, logo_url = ?, address = ?, phone = ?, open_time = ?, close_time = ?,
      status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [name, slug, tagline, cuisine, themeColor, accentColor, logoEmoji, logoUrl, address, phone, openTime, closeTime, status, id]);

  const updated = await queryOne('SELECT * FROM restaurants WHERE id = ?', [id]);
  res.json({ success: true, restaurant: updated });
});

// DELETE /api/restaurants/:id (SUPER_ADMIN ONLY)
router.delete('/:id', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  const id = req.params.id;
  await execute('DELETE FROM restaurants WHERE id = ?', [id]);
  res.json({ success: true, message: `Restaurant ${id} deleted successfully.` });
});

module.exports = router;
