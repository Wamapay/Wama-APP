/**
 * Role-based authorization middleware.
 *
 * Usage:
 *
 *   router.get(
 *     "/admin/users",
 *     authenticate,
 *     requireRole("ADMIN", "SUPER_ADMIN"),
 *     adminController.listUsers
 *   );
 *
 * Roles: USER, AGENT, ADMIN, SUPER_ADMIN.
 * The frontend NEVER determines permissions — the backend is the
 * single source of truth for role/permission enforcement.
 */
"use strict";

const ApiError = require("../utils/ApiError");

const ROLES = Object.freeze({
  USER: "USER",
  AGENT: "AGENT",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
});

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required."));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden("You do not have permission to perform this action."));
    }
    return next();
  };
}

// Back-compat alias — earlier architecture doc referred to this as `authorize`.
const authorize = requireRole;

module.exports = { requireRole, authorize, ROLES };
