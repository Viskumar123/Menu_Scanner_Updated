/**
 * server/middleware/tenant.js — Multi-Tenant Isolation Middleware.
 * Enforces strict boundary verification: Users can only read/mutate resources
 * belonging to their assigned restaurants. Super Admins have global access.
 */

const { queryOne } = require('../db');

async function enforceTenantAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }

  // Super Admin bypasses tenant isolation
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  // Extract restaurant ID from params or body or query
  const targetRestaurantId =
    req.params.restaurantId ||
    req.params.id ||
    req.body.restaurantId ||
    req.body.restaurant_id ||
    req.query.restaurantId;

  if (!targetRestaurantId) {
    return res.status(400).json({
      success: false,
      error: 'Missing restaurant identifier in request.'
    });
  }

  // Check mapping in restaurant_users
  const mapping = await queryOne(`
    SELECT * FROM restaurant_users
    WHERE restaurant_id = ? AND user_id = ?
  `, [targetRestaurantId, req.user.id]);

  if (!mapping) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Access denied. You do not have permission to manage this restaurant.'
    });
  }

  req.restaurantRole = mapping.role; // e.g. 'OWNER', 'MANAGER', 'STAFF'
  next();
}

module.exports = {
  enforceTenantAccess
};
