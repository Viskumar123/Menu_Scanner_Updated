/**
 * server/routes/qr.routes.js — Stable QR Code Routing & Management.
 * Provides canonical, permanent URLs (/r/:identifier) and table assignments.
 */

const express = require('express');
const router = express.Router();
const { queryOne, queryAll, execute } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { enforceTenantAccess } = require('../middleware/tenant');

// ═══════════════════════════════════════════════
// CANONICAL STABLE QR RESOLUTION: /r/:identifier
// ═══════════════════════════════════════════════
router.get('/r/:identifier', (req, res) => {
  const ident = req.params.identifier.trim();
  const queryTable = req.query.table || '';

  // 1. Try resolving via qr_codes table
  let qrRecord = queryOne(`
    SELECT * FROM qr_codes
    WHERE identifier = ? AND status = 'ACTIVE'
  `, [ident]);

  let restaurant = null;
  let tableNumber = queryTable;

  if (qrRecord) {
    restaurant = queryOne("SELECT * FROM restaurants WHERE id = ? AND status = 'ACTIVE'", [qrRecord.restaurant_id]);
    tableNumber = qrRecord.table_number || queryTable;
  } else {
    // 2. Fallback: try resolving identifier as restaurant ID or Slug directly
    restaurant = queryOne(`
      SELECT * FROM restaurants
      WHERE (id = ? OR slug = ?) AND status = 'ACTIVE'
    `, [ident, ident]);
  }

  if (!restaurant) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Restaurant Not Found — MenuScan</title>
        <link rel="stylesheet" href="/css/menu.css">
        <style>body { display:flex; align-items:center; justify-content:center; min-height:100vh; font-family: sans-serif; }</style>
      </head>
      <body>
        <div class="err-card" style="background:#111118; border:1px solid #333; padding:2rem; border-radius:16px; text-align:center; max-width:400px; color:#fff;">
          <div style="font-size:3rem; margin-bottom:1rem;">⚠️</div>
          <h2>Restaurant Not Found</h2>
          <p style="color:#999; margin:1rem 0;">The QR code you scanned ("${ident}") is not currently active or recognized.</p>
          <a href="/" style="display:inline-block; padding:10px 20px; background:#f4a261; color:#000; text-decoration:none; border-radius:8px; font-weight:700;">← Return to Scanner</a>
        </div>
      </body>
      </html>
    `);
  }

  // 3. Log anonymous QR_SCAN analytics event
  try {
    const eventId = `EVT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const metadata = JSON.stringify({
      table: tableNumber,
      userAgent: req.headers['user-agent'] || '',
      ip: req.ip || ''
    });

    execute(`
      INSERT INTO analytics_events (id, restaurant_id, qr_code_id, event_type, metadata)
      VALUES (?, ?, ?, 'QR_SCAN', ?)
    `, [eventId, restaurant.id, qrRecord ? qrRecord.id : 'DIRECT', metadata]);
  } catch (e) {
    console.warn('Failed to log QR analytics:', e);
  }

  // 4. Redirect to client-side menu interface
  let destination = `/menu.html?restaurant=${encodeURIComponent(restaurant.id)}`;
  if (tableNumber) {
    destination += `&table=${encodeURIComponent(tableNumber)}`;
  }

  return res.redirect(302, destination);
});

// ═══════════════════════════════════════════════
// QR MANAGEMENT API
// ═══════════════════════════════════════════════

// GET /api/qr-codes/:restaurantId
router.get('/api/qr-codes/:restaurantId', requireAuth, enforceTenantAccess, (req, res) => {
  const rid = req.params.restaurantId;
  const qrs = queryAll(`
    SELECT * FROM qr_codes
    WHERE restaurant_id = ?
    ORDER BY created_at ASC
  `, [rid]);

  res.json({ success: true, count: qrs.length, qrCodes: qrs });
});

// POST /api/qr-codes/:restaurantId (Create Table QR)
router.post('/api/qr-codes/:restaurantId', requireAuth, enforceTenantAccess, (req, res) => {
  const rid = req.params.restaurantId;
  const { tableNumber = '', label } = req.body;

  const qrId = `QR_${rid}_${tableNumber ? 'T' + tableNumber : Date.now()}`;
  const identifier = tableNumber ? `${rid}_T${tableNumber}` : `${rid}_${Date.now()}`;
  const qrLabel = label || (tableNumber ? `Table ${tableNumber} QR` : `General QR`);

  execute(`
    INSERT INTO qr_codes (id, restaurant_id, identifier, label, table_number, status)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE')
  `, [qrId, rid, identifier, qrLabel, tableNumber]);

  const created = queryOne('SELECT * FROM qr_codes WHERE id = ?', [qrId]);
  res.status(201).json({ success: true, qrCode: created });
});

// DELETE /api/qr-codes/:id
router.delete('/api/qr-codes/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  const existing = queryOne('SELECT * FROM qr_codes WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ success: false, error: 'QR code not found.' });

  if (req.user.role !== 'SUPER_ADMIN') {
    const isMapped = queryOne('SELECT id FROM restaurant_users WHERE restaurant_id = ? AND user_id = ?', [existing.restaurant_id, req.user.id]);
    if (!isMapped) return res.status(403).json({ success: false, error: 'Forbidden.' });
  }

  execute('DELETE FROM qr_codes WHERE id = ?', [id]);
  res.json({ success: true, message: 'QR code deleted.' });
});

module.exports = router;
