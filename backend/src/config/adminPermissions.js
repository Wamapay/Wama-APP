/**
 * Admin roles and permissions (User Dashboard Control Center, Part 15).
 *
 * ADMIN_ROLES: every Role value that counts as "an admin at all" — used
 * everywhere the codebase previously hardcoded ["ADMIN", "SUPER_ADMIN"]
 * (course visibility, review moderation, the /admin route gate). A
 * FINANCE_ADMIN or CUSTOMER_SUPPORT account is still a real admin for
 * these baseline purposes — only the SENSITIVE actions below are
 * restricted further.
 *
 * PERMISSIONS: the specific sensitive financial/security actions that
 * need real per-role restriction, per the platform rule "Sensitive
 * financial/security actions should require appropriate permissions."
 *
 * IMPORTANT — backward compatibility: SUPER_ADMIN and the original
 * generic ADMIN role both get every permission, unrestricted, exactly
 * as they always have. Every account created before this feature
 * existed keeps working identically — nothing is retroactively
 * restricted. The new specialized roles (FINANCE_ADMIN, CONTENT_ADMIN,
 * LEARNING_ADMIN, CUSTOMER_SUPPORT, MARKETING_ADMIN) are narrower,
 * OPT-IN roles for assigning to staff going forward — "don't give every
 * staff member unrestricted access automatically" applies to NEW role
 * assignments, not a change to what already exists.
 */
"use strict";

const ADMIN_ROLES = Object.freeze([
  "ADMIN",
  "SUPER_ADMIN",
  "FINANCE_ADMIN",
  "CONTENT_ADMIN",
  "LEARNING_ADMIN",
  "CUSTOMER_SUPPORT",
  "MARKETING_ADMIN",
]);

const SPECIALIZED_ADMIN_ROLES = Object.freeze(
  ADMIN_ROLES.filter((r) => r !== "ADMIN" && r !== "SUPER_ADMIN")
);

const PERMISSIONS = Object.freeze({
  ADJUST_BALANCE: "ADJUST_BALANCE",
  MANAGE_WITHDRAWALS: "MANAGE_WITHDRAWALS",
  MANAGE_SETTINGS: "MANAGE_SETTINGS",
  MANAGE_COURSE_ACCESS: "MANAGE_COURSE_ACCESS",
  MANAGE_USERS: "MANAGE_USERS",
  MANAGE_USER_OVERRIDES: "MANAGE_USER_OVERRIDES",
  SEND_NOTIFICATIONS: "SEND_NOTIFICATIONS",
  VIEW_CUSTOMER_DETAIL: "VIEW_CUSTOMER_DETAIL",
  VIEW_AUDIT_LOG: "VIEW_AUDIT_LOG",
  MANAGE_ADMIN_ROLES: "MANAGE_ADMIN_ROLES",
});

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const ROLE_PERMISSIONS = Object.freeze({
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS, // backward compatibility — see file header.
  FINANCE_ADMIN: [
    PERMISSIONS.ADJUST_BALANCE,
    PERMISSIONS.MANAGE_WITHDRAWALS,
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.VIEW_AUDIT_LOG,
    PERMISSIONS.VIEW_CUSTOMER_DETAIL,
  ],
  CONTENT_ADMIN: [
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.VIEW_CUSTOMER_DETAIL,
  ],
  LEARNING_ADMIN: [
    PERMISSIONS.MANAGE_COURSE_ACCESS,
    PERMISSIONS.VIEW_CUSTOMER_DETAIL,
  ],
  CUSTOMER_SUPPORT: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_COURSE_ACCESS,
    PERMISSIONS.MANAGE_USER_OVERRIDES,
    PERMISSIONS.SEND_NOTIFICATIONS,
    PERMISSIONS.VIEW_CUSTOMER_DETAIL,
  ],
  MARKETING_ADMIN: [
    PERMISSIONS.SEND_NOTIFICATIONS,
    PERMISSIONS.VIEW_CUSTOMER_DETAIL,
  ],
});

function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role];
  return Array.isArray(granted) && granted.includes(permission);
}

module.exports = { ADMIN_ROLES, SPECIALIZED_ADMIN_ROLES, PERMISSIONS, ROLE_PERMISSIONS, hasPermission };
