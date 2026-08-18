/**
 * server/server.js — Production Express Server for MenuScan Platform.
 * Serves multi-tenant REST APIs, canonical stable QR redirects (/r/:id),
 * and high-performance static client frontend.
 */

const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config();

const { getDB } = require('./db');
const { seedDatabase } = require('./db/seed');

// Import Route Handlers
const authRoutes = require('./routes/auth.routes');
const restaurantRoutes = require('./routes/restaurants.routes');
const menuRoutes = require('./routes/menus.routes');
const qrRoutes = require('./routes/qr.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const orderRoutes = require('./routes/orders.routes');
const uploadRoutes = require('./routes/upload.routes');

const app = express();
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0';

// ── 1. Security & Core Middleware ──────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Structured Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.startsWith('/css') && !req.path.startsWith('/js')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// ── 2. Static Assets Serving ───────────────────────────────────
const ROOT_DIR = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded user media
app.use('/uploads', express.static(UPLOADS_DIR));

// ── 3. Canonical QR Resolution Route ───────────────────────────
// /r/:identifier (e.g. /r/the-spice-garden or /r/R001 or /r/R001_T5)
app.use('/', qrRoutes);

// ── 4. API Routes ──────────────────────────────────────────────
// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api', menuRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);

// ── 5. Static Frontend Application ─────────────────────────────
app.use(express.static(ROOT_DIR));

// Fallback for root /
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// ── 6. Error Handling Middleware ───────────────────────────────
app.use((err, req, res, next) => {
  console.error('[MenuScan Server Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// ── 7. Server Initialization & Bootstrapping ───────────────────
function startServer() {
  try {
    // Ensure DB connection and initialize seeds if needed
    getDB();
    seedDatabase(false);

    const server = app.listen(PORT, HOST, () => {
      console.log(`\n════════════════════════════════════════════════════════════`);
      console.log(`✨ MenuScan Production Server running on http://${HOST}:${PORT}`);
      console.log(`📱 Public Landing & Scanner:  http://localhost:${PORT}/index.html`);
      console.log(`🍽️ Stable Restaurant QR URL: http://localhost:${PORT}/r/the-spice-garden`);
      console.log(`🔐 Admin Management Portal:   http://localhost:${PORT}/admin.html`);
      console.log(`⚡ API Health Check:          http://localhost:${PORT}/api/health`);
      console.log(`════════════════════════════════════════════════════════════\n`);
    });

    return server;
  } catch (err) {
    console.error('Fatal Server Boot Error:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
