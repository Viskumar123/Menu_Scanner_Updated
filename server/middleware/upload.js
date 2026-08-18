/**
 * server/middleware/upload.js — Secure File Upload Engine.
 * Handles restaurant logos and dish food photos with MIME validation & size restrictions.
 */

const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const rand = crypto.randomBytes(8).toString('hex');
    const safeName = `media_${Date.now()}_${rand}${ext}`;
    cb(null, safeName);
  }
});

// File Filter for Image Types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, GIF, and SVG images are permitted.'), false);
  }
};

// Multer Instance (5MB max limit)
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: fileFilter
});

module.exports = upload;
