/**
 * server/routes/orders.routes.js — Table Orders Management.
 */

const express = require('express');
const router = express.Router();
const { queryOne, queryAll, execute } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { enforceTenantAccess } = require('../middleware/tenant');

// POST /api/orders (Place Table Order - Public)
router.post('/', (req, res) => {
  const { restaurantId, tableNumber = 'Takeaway', items = [], subtotal = 0, tax = 0, grandTotal = 0, notes = '' } = req.body;

  if (!restaurantId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'restaurantId and order items are required.' });
  }

  const restaurant = queryOne('SELECT name FROM restaurants WHERE id = ?', [restaurantId]);
  if (!restaurant) {
    return res.status(404).json({ success: false, error: 'Restaurant not found.' });
  }

  const orderId = 'ORD' + Date.now().toString().slice(-6);

  execute(`
    INSERT INTO orders (
      id, restaurant_id, table_number, items_json, subtotal, tax, grand_total, notes, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Received')
  `, [orderId, restaurantId, tableNumber, JSON.stringify(items), subtotal, tax, grandTotal, notes]);

  // Log analytics event
  try {
    const eventId = `EVT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    execute(`
      INSERT INTO analytics_events (id, restaurant_id, event_type, metadata)
      VALUES (?, ?, 'ORDER_PLACED', ?)
    `, [eventId, restaurantId, JSON.stringify({ orderId, tableNumber, grandTotal })]);
  } catch (e) {}

  res.status(201).json({
    success: true,
    orderId,
    restaurantName: restaurant.name,
    tableNumber,
    grandTotal,
    status: 'Received'
  });
});

// GET /api/orders/:restaurantId (Kitchen Stream - Tenant Protected)
router.get('/:restaurantId', requireAuth, enforceTenantAccess, (req, res) => {
  const rid = req.params.restaurantId;
  const orders = queryAll(`
    SELECT o.*, r.name as restaurant_name
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
    WHERE o.restaurant_id = ?
    ORDER BY o.created_at DESC LIMIT 50
  `, [rid]);

  const parsed = orders.map(o => ({
    orderId: o.id,
    restaurantId: o.restaurant_id,
    restaurantName: o.restaurant_name,
    tableNumber: o.table_number,
    items: JSON.parse(o.items_json || '[]'),
    subtotal: o.subtotal,
    tax: o.tax,
    grandTotal: o.grand_total,
    notes: o.notes,
    status: o.status,
    timestamp: o.created_at
  }));

  res.json({ success: true, count: parsed.length, orders: parsed });
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', requireAuth, (req, res) => {
  const id = req.params.id;
  const { status } = req.body; // 'Received', 'Preparing', 'Served', 'Cancelled'

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });

  if (req.user.role !== 'SUPER_ADMIN') {
    const isMapped = queryOne('SELECT id FROM restaurant_users WHERE restaurant_id = ? AND user_id = ?', [order.restaurant_id, req.user.id]);
    if (!isMapped) return res.status(403).json({ success: false, error: 'Forbidden.' });
  }

  execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  res.json({ success: true, orderId: id, status });
});

// DELETE /api/orders/:restaurantId/clear
router.delete('/:restaurantId/clear', requireAuth, enforceTenantAccess, (req, res) => {
  const rid = req.params.restaurantId;
  execute('DELETE FROM orders WHERE restaurant_id = ?', [rid]);
  res.json({ success: true, message: 'Orders cleared for restaurant.' });
});

module.exports = router;
