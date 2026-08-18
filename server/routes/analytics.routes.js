/**
 * server/routes/analytics.routes.js — Anonymous Product Analytics & KPI Metrics.
 */

const express = require('express');
const router = express.Router();
const { queryOne, queryAll, execute } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { enforceTenantAccess } = require('../middleware/tenant');

// POST /api/analytics/event (Public Event Logger)
router.post('/event', (req, res) => {
  const { restaurantId, qrCodeId = '', eventType, metadata = {} } = req.body;

  if (!restaurantId || !eventType) {
    return res.status(400).json({ success: false, error: 'restaurantId and eventType are required.' });
  }

  const eventId = `EVT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  execute(`
    INSERT INTO analytics_events (id, restaurant_id, qr_code_id, event_type, metadata)
    VALUES (?, ?, ?, ?, ?)
  `, [eventId, restaurantId, qrCodeId, eventType, JSON.stringify(metadata)]);

  res.status(201).json({ success: true, eventId });
});

// GET /api/analytics/:restaurantId (Dashboard Analytics)
router.get('/:restaurantId', requireAuth, enforceTenantAccess, (req, res) => {
  const rid = req.params.restaurantId;

  // Aggregate event counts
  const scansCount = queryOne(`
    SELECT COUNT(*) as count FROM analytics_events
    WHERE restaurant_id = ? AND event_type = 'QR_SCAN'
  `, [rid])?.count || 0;

  const menuViews = queryOne(`
    SELECT COUNT(*) as count FROM analytics_events
    WHERE restaurant_id = ? AND event_type = 'MENU_VIEW'
  `, [rid])?.count || 0;

  const ordersCount = queryOne(`
    SELECT COUNT(*) as count FROM orders
    WHERE restaurant_id = ?
  `, [rid])?.count || 0;

  const totalRevenue = queryOne(`
    SELECT COALESCE(SUM(grand_total), 0) as total FROM orders
    WHERE restaurant_id = ? AND status != 'Cancelled'
  `, [rid])?.total || 0;

  // Top popular dishes from menu items marked bestseller or viewed
  const topItems = queryAll(`
    SELECT id, name, price, is_bestseller, emoji
    FROM menu_items
    WHERE restaurant_id = ? AND status = 'ACTIVE'
    ORDER BY is_bestseller DESC, price DESC LIMIT 5
  `, [rid]);

  res.json({
    success: true,
    analytics: {
      qrScans: scansCount,
      menuViews: menuViews,
      totalOrders: ordersCount,
      totalRevenue: totalRevenue,
      topItems
    }
  });
});

module.exports = router;
