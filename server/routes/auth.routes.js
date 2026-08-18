/**
 * server/routes/auth.routes.js — Authentication & Session Endpoints.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { queryOne, queryAll, execute } = require('../db');
const { generateToken, requireAuth } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password, role = 'RESTAURANT_OWNER' } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
  }

  const existing = queryOne('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  if (existing) {
    return res.status(409).json({ success: false, error: 'An account with this email address already exists.' });
  }

  const userId = `USR_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const passwordHash = bcrypt.hashSync(password, 10);

  execute(`
    INSERT INTO users (id, name, email, password_hash, role, status)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE')
  `, [userId, name.trim(), email.toLowerCase().trim(), passwordHash, role]);

  const newUser = { id: userId, name: name.trim(), email: email.toLowerCase().trim(), role };
  const token = generateToken(newUser);

  res.status(201).json({
    success: true,
    token,
    user: newUser
  });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = queryOne('SELECT * FROM users WHERE email = ?', [cleanEmail]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, error: 'Invalid email or password.' });
  }

  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ success: false, error: 'This account has been suspended or deactivated.' });
  }

  // Fetch assigned restaurants
  const assigned = queryAll(`
    SELECT r.id, r.name, r.slug, r.theme_color, r.logo_emoji, ru.role as user_role
    FROM restaurant_users ru
    JOIN restaurants r ON r.id = ru.restaurant_id
    WHERE ru.user_id = ?
  `, [user.id]);

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    assignedRestaurants: assigned
  };

  const token = generateToken(safeUser);

  res.json({
    success: true,
    token,
    user: safeUser
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const assigned = queryAll(`
    SELECT r.id, r.name, r.slug, r.theme_color, r.logo_emoji, ru.role as user_role
    FROM restaurant_users ru
    JOIN restaurants r ON r.id = ru.restaurant_id
    WHERE ru.user_id = ?
  `, [req.user.id]);

  res.json({
    success: true,
    user: {
      ...req.user,
      assignedRestaurants: assigned
    }
  });
});

module.exports = router;
