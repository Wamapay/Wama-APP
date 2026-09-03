/**
 * Permission-based authorization — layered ON TOP of requireRole's
 * coarse "is this an admin at all" gate (every /admin route already
 * requires that). This middleware additionally checks whether this
 * SPECIFIC admin role may perform this SPECIFIC sensitive action — see
 * src/config/adminPermissions.js for the full role -> permission map.
 *
 * Usage:
 *   router.post("/users/:id/balance-adjustments",
 *     requirePermission(PERMISSIONS.ADJUST_BALANCE),
 *     adminController.adjustBalance);
 */
"use strict";

const ApiError = require("../utils/ApiError");
const { hasPermission } = require("../config/adminPermissions");

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required."));
    }
    if (!hasPermission(req.user.role, permission)) {
      return next(ApiError.forbidden(`Your admin role does not have permission to perform this action (${permission}).`));
    }
    return next();
  };
}

module.exports = requirePermission;
