/**
 * Reusable course-access check. This is the single source of truth for
 * "can this user see this course's protected content" — never inferred
 * anywhere else, and never something the frontend decides on its own.
 */
"use strict";

const { prisma } = require("../database/client");

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

/**
 * @param {string|null|undefined} userId
 * @param {string} courseId
 * @returns {Promise<boolean>}
 */
async function hasCourseAccess(userId, courseId) {
  if (!userId) return false;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return false;

  // Admins can always view course content (moderation/support).
  if (ADMIN_ROLES.has(user.role)) return true;

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });

  return Boolean(enrollment && enrollment.status !== "SUSPENDED");
}

module.exports = { hasCourseAccess };
