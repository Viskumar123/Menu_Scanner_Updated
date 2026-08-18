/**
 * server/routes/upload.routes.js — Image Upload Endpoint.
 * Supports food dish photos and restaurant logos with type validation and size limits.
 */

const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { requireAuth } = require('../middleware/auth');

// POST /api/upload (Protected Image Upload)
router.post('/', requireAuth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided.' });
    }

    const publicUrl = `/uploads/${req.file.filename}`;

    res.json({
      success: true,
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  });
});

module.exports = router;
