/**
 * server/routes/menus.routes.js — Menus, Categories & Dish Items CRUD.
 */

const express = require('express');
const router = express.Router();
const { queryOne, queryAll, execute } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { enforceTenantAccess } = require('../middleware/tenant');

// ═══════════════════════════════════════════════
// 1. MENUS (/api/menus/...)
// ═══════════════════════════════════════════════

// GET /api/menus/:restaurantId
router.get('/menus/:restaurantId', optionalAuth, (req, res) => {
  const rid = req.params.restaurantId;
  const isOwner = req.user && (req.user.role === 'SUPER_ADMIN' || queryOne('SELECT id FROM restaurant_users WHERE restaurant_id = ? AND user_id = ?', [rid, req.user.id]));

  let menus;
  if (isOwner) {
    menus = queryAll('SELECT * FROM menus WHERE restaurant_id = ? ORDER BY created_at DESC', [rid]);
  } else {
    menus = queryAll("SELECT * FROM menus WHERE restaurant_id = ? AND status = 'PUBLISHED' ORDER BY version DESC", [rid]);
  }

  res.json({ success: true, count: menus.length, menus });
});

// POST /api/menus/:restaurantId (Create Menu)
router.post('/menus/:restaurantId', requireAuth, enforceTenantAccess, (req, res) => {
  const rid = req.params.restaurantId;
  const { name = 'New Menu', description = '', status = 'DRAFT' } = req.body;
  const menuId = `MENU_${rid}_${Date.now()}`;

  execute(`
    INSERT INTO menus (id, restaurant_id, name, description, status, version)
    VALUES (?, ?, ?, ?, ?, 1)
  `, [menuId, rid, name.trim(), description, status]);

  const created = queryOne('SELECT * FROM menus WHERE id = ?', [menuId]);
  res.status(201).json({ success: true, menu: created });
});

// PUT /api/menus/:id/status (Publish / Unpublish / Archive)
router.put('/menus/:id/status', requireAuth, (req, res) => {
  const menuId = req.params.id;
  const { status } = req.body; // 'DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'

  const menu = queryOne('SELECT * FROM menus WHERE id = ?', [menuId]);
  if (!menu) {
    return res.status(404).json({ success: false, error: 'Menu not found.' });
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    const isMapped = queryOne('SELECT id FROM restaurant_users WHERE restaurant_id = ? AND user_id = ?', [menu.restaurant_id, req.user.id]);
    if (!isMapped) return res.status(403).json({ success: false, error: 'Forbidden: You do not own this menu.' });
  }

  execute('UPDATE menus SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, menuId]);
  res.json({ success: true, menuId, status });
});

// ═══════════════════════════════════════════════
// 2. CATEGORIES (/api/categories/...)
// ═══════════════════════════════════════════════

// GET /api/categories/:restaurantId
router.get('/categories/:restaurantId', (req, res) => {
  const rid = req.params.restaurantId;
  const categories = queryAll(`
    SELECT c.* FROM categories c
    JOIN menus m ON m.id = c.menu_id
    WHERE m.restaurant_id = ? AND c.status = 'ACTIVE'
    ORDER BY c.display_order ASC
  `, [rid]);

  res.json({ success: true, count: categories.length, categories });
});

// POST /api/categories
router.post('/categories', requireAuth, (req, res) => {
  const { restaurantId, menuId, name, description = '', displayOrder = 0 } = req.body;

  if (!restaurantId || !name) {
    return res.status(400).json({ success: false, error: 'restaurantId and name are required.' });
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    const isMapped = queryOne('SELECT id FROM restaurant_users WHERE restaurant_id = ? AND user_id = ?', [restaurantId, req.user.id]);
    if (!isMapped) return res.status(403).json({ success: false, error: 'Forbidden: Access denied to restaurant.' });
  }

  const targetMenuId = menuId || queryOne('SELECT id FROM menus WHERE restaurant_id = ? LIMIT 1', [restaurantId])?.id;
  if (!targetMenuId) {
    return res.status(400).json({ success: false, error: 'No menu found for restaurant.' });
  }

  const catId = `CAT_${restaurantId}_${Date.now()}`;
  execute(`
    INSERT INTO categories (id, menu_id, name, description, display_order, status)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE')
  `, [catId, targetMenuId, name.trim(), description, displayOrder]);

  const created = queryOne('SELECT * FROM categories WHERE id = ?', [catId]);
  res.status(201).json({ success: true, category: created });
});

// ═══════════════════════════════════════════════
// 3. MENU ITEMS (/api/items/...)
// ═══════════════════════════════════════════════

// GET /api/items (All items or filtered across restaurants)
router.get('/items', (req, res) => {
  const { restaurantId, category, search, vegOnly, availableOnly } = req.query;

  let query = `
    SELECT mi.*, c.name as category_name, r.name as restaurant_name, r.theme_color, r.logo_emoji
    FROM menu_items mi
    JOIN categories c ON c.id = mi.category_id
    JOIN restaurants r ON r.id = mi.restaurant_id
    WHERE mi.status = 'ACTIVE'
  `;
  const params = [];

  if (restaurantId && restaurantId !== 'all') {
    query += ` AND mi.restaurant_id = ?`;
    params.push(restaurantId);
  }

  if (category && category !== 'All') {
    query += ` AND c.name = ?`;
    params.push(category);
  }

  if (search && search.trim()) {
    query += ` AND (mi.name LIKE ? OR mi.description LIKE ? OR c.name LIKE ? OR r.name LIKE ?)`;
    const q = `%${search.trim()}%`;
    params.push(q, q, q, q);
  }

  if (vegOnly === 'true' || vegOnly === '1') {
    query += ` AND mi.is_vegetarian = 1`;
  }

  if (availableOnly === 'true' || availableOnly === '1') {
    query += ` AND mi.is_available = 1`;
  }

  query += ` ORDER BY mi.restaurant_id ASC, mi.display_order ASC, mi.name ASC`;

  const items = queryAll(query, params);

  const formatted = items.map(i => ({
    id: i.id,
    restaurantId: i.restaurant_id,
    restaurantName: i.restaurant_name,
    themeColor: i.theme_color,
    restaurantLogoEmoji: i.logo_emoji,
    categoryId: i.category_id,
    category: i.category_name,
    name: i.name,
    description: i.description,
    price: i.price,
    currency: i.currency,
    imageUrl: i.image_url,
    imageAltText: i.image_alt_text,
    emoji: i.emoji,
    isVegetarian: Boolean(i.is_vegetarian),
    isAvailable: Boolean(i.is_available),
    isBestseller: Boolean(i.is_bestseller),
    spiceLevel: i.spice_level,
    allergens: i.allergens
  }));

  res.json({ success: true, count: formatted.length, items: formatted });
});

// GET /api/items/:restaurantId (Public / Filtered Query)
router.get('/items/:restaurantId', (req, res) => {
  const rid = req.params.restaurantId;
  const { category, search, vegOnly, availableOnly } = req.query;

  let query = `
    SELECT mi.*, c.name as category_name, r.name as restaurant_name
    FROM menu_items mi
    JOIN categories c ON c.id = mi.category_id
    JOIN restaurants r ON r.id = mi.restaurant_id
    WHERE mi.restaurant_id = ? AND mi.status = 'ACTIVE'
  `;
  const params = [rid];

  if (category && category !== 'All') {
    query += ` AND c.name = ?`;
    params.push(category);
  }

  if (search && search.trim()) {
    query += ` AND (mi.name LIKE ? OR mi.description LIKE ? OR c.name LIKE ?)`;
    const q = `%${search.trim()}%`;
    params.push(q, q, q);
  }

  if (vegOnly === 'true' || vegOnly === '1') {
    query += ` AND mi.is_vegetarian = 1`;
  }

  if (availableOnly === 'true' || availableOnly === '1') {
    query += ` AND mi.is_available = 1`;
  }

  query += ` ORDER BY mi.display_order ASC, mi.name ASC`;

  const items = queryAll(query, params);

  const formatted = items.map(i => ({
    id: i.id,
    restaurantId: i.restaurant_id,
    restaurantName: i.restaurant_name,
    categoryId: i.category_id,
    category: i.category_name,
    name: i.name,
    description: i.description,
    price: i.price,
    currency: i.currency,
    imageUrl: i.image_url,
    imageAltText: i.image_alt_text,
    emoji: i.emoji,
    isVegetarian: Boolean(i.is_vegetarian),
    isAvailable: Boolean(i.is_available),
    isBestseller: Boolean(i.is_bestseller),
    spiceLevel: i.spice_level,
    allergens: i.allergens
  }));

  res.json({ success: true, count: formatted.length, items: formatted });
});

// POST /api/items (Add Dish)
router.post('/items', requireAuth, (req, res) => {
  const {
    restaurantId, categoryName = 'Main Course', name, description = '',
    price = 0, currency = '₹', imageUrl = '', imageAltText = '', emoji = '🍽️',
    isVegetarian = true, isAvailable = true, isBestseller = false, spiceLevel = 'None',
    allergens = ''
  } = req.body;

  if (!restaurantId || !name) {
    return res.status(400).json({ success: false, error: 'restaurantId and name are required.' });
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    const isMapped = queryOne('SELECT id FROM restaurant_users WHERE restaurant_id = ? AND user_id = ?', [restaurantId, req.user.id]);
    if (!isMapped) return res.status(403).json({ success: false, error: 'Forbidden: Access denied to restaurant.' });
  }

  let category = queryOne(`
    SELECT c.id FROM categories c
    JOIN menus m ON m.id = c.menu_id
    WHERE m.restaurant_id = ? AND c.name = ? LIMIT 1
  `, [restaurantId, categoryName]);

  let categoryId = category?.id;
  if (!categoryId) {
    const menuId = queryOne('SELECT id FROM menus WHERE restaurant_id = ? LIMIT 1', [restaurantId])?.id || `MENU_${restaurantId}`;
    categoryId = `CAT_${restaurantId}_${Date.now()}`;
    execute(`
      INSERT INTO categories (id, menu_id, name, description, display_order, status)
      VALUES (?, ?, ?, '', 99, 'ACTIVE')
    `, [categoryId, menuId, categoryName]);
  }

  const itemId = `I${Date.now().toString().slice(-6)}`;
  const isVeg = isVegetarian ? 1 : 0;
  const isAvail = isAvailable ? 1 : 0;
  const isBs = isBestseller ? 1 : 0;

  execute(`
    INSERT INTO menu_items (
      id, category_id, restaurant_id, name, description, price, currency,
      image_url, image_alt_text, emoji, is_vegetarian, is_available, is_bestseller,
      spice_level, allergens, display_order, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 99, 'ACTIVE')
  `, [itemId, categoryId, restaurantId, name.trim(), description, parseFloat(price) || 0, currency, imageUrl, imageAltText || `${name} dish photo`, emoji, isVeg, isAvail, isBs, spiceLevel, allergens]);

  const created = queryOne('SELECT * FROM menu_items WHERE id = ?', [itemId]);
  res.status(201).json({ success: true, item: created });
});

// PUT /api/items/:id (Update Dish)
router.put('/items/:id', requireAuth, (req, res) => {
  const itemId = req.params.id;
  const existing = queryOne('SELECT * FROM menu_items WHERE id = ?', [itemId]);

  if (!existing) {
    return res.status(404).json({ success: false, error: 'Menu item not found.' });
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    const isMapped = queryOne('SELECT id FROM restaurant_users WHERE restaurant_id = ? AND user_id = ?', [existing.restaurant_id, req.user.id]);
    if (!isMapped) return res.status(403).json({ success: false, error: 'Forbidden: Access denied to this item.' });
  }

  const {
    name = existing.name,
    description = existing.description,
    price = existing.price,
    imageUrl = existing.image_url,
    imageAltText = existing.image_alt_text,
    emoji = existing.emoji,
    isVegetarian = existing.is_vegetarian,
    isAvailable = existing.is_available,
    isBestseller = existing.is_bestseller,
    spiceLevel = existing.spice_level,
    allergens = existing.allergens
  } = req.body;

  const isVeg = isVegetarian === true || isVegetarian === 1 || isVegetarian === 'true' ? 1 : 0;
  const isAvail = isAvailable === true || isAvailable === 1 || isAvailable === 'true' ? 1 : 0;
  const isBs = isBestseller === true || isBestseller === 1 || isBestseller === 'true' ? 1 : 0;

  execute(`
    UPDATE menu_items SET
      name = ?, description = ?, price = ?, image_url = ?, image_alt_text = ?,
      emoji = ?, is_vegetarian = ?, is_available = ?, is_bestseller = ?,
      spice_level = ?, allergens = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [name, description, parseFloat(price) || 0, imageUrl, imageAltText, emoji, isVeg, isAvail, isBs, spiceLevel, allergens, itemId]);

  const updated = queryOne('SELECT * FROM menu_items WHERE id = ?', [itemId]);
  res.json({ success: true, item: updated });
});

// PATCH /api/items/:id/availability
router.patch('/items/:id/availability', requireAuth, (req, res) => {
  const itemId = req.params.id;
  const existing = queryOne('SELECT * FROM menu_items WHERE id = ?', [itemId]);

  if (!existing) {
    return res.status(404).json({ success: false, error: 'Menu item not found.' });
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    const isMapped = queryOne('SELECT id FROM restaurant_users WHERE restaurant_id = ? AND user_id = ?', [existing.restaurant_id, req.user.id]);
    if (!isMapped) return res.status(403).json({ success: false, error: 'Forbidden: Access denied.' });
  }

  const nextStatus = existing.is_available === 1 ? 0 : 1;
  execute('UPDATE menu_items SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextStatus, itemId]);

  res.json({
    success: true,
    itemId,
    isAvailable: Boolean(nextStatus),
    statusLabel: nextStatus === 1 ? 'In Stock' : 'Sold Out'
  });
});

// DELETE /api/items/:id
router.delete('/items/:id', requireAuth, (req, res) => {
  const itemId = req.params.id;
  const existing = queryOne('SELECT * FROM menu_items WHERE id = ?', [itemId]);

  if (!existing) {
    return res.status(404).json({ success: false, error: 'Menu item not found.' });
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    const isMapped = queryOne('SELECT id FROM restaurant_users WHERE restaurant_id = ? AND user_id = ?', [existing.restaurant_id, req.user.id]);
    if (!isMapped) return res.status(403).json({ success: false, error: 'Forbidden: Access denied.' });
  }

  execute('DELETE FROM menu_items WHERE id = ?', [itemId]);
  res.json({ success: true, message: `Dish ${itemId} removed successfully.` });
});

module.exports = router;
