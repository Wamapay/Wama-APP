/**
 * Recovery tool for locked-out admins, driven by environment variables so
 * it can be used from the Railway Variables screen (no shell needed).
 *
 * Set ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD (min 10 characters),
 * deploy, log in, then DELETE both variables. On every start while they
 * are set, the account is (re)set: password replaced, status ACTIVE,
 * email marked verified, and promoted to SUPER_ADMIN if it was not
 * already an admin-tier role. If no account has that email, one is created.
 */
"use strict";

const { hashPassword } = require("../utils/password");

const { ADMIN_ROLES: ADMIN_TIER } = require("../config/adminPermissions");

async function runAdminBootstrap(prisma, logger, env = process.env) {
  const email = String(env.ADMIN_RESET_EMAIL || "").trim().toLowerCase();
  const password = String(env.ADMIN_RESET_PASSWORD || "");
  if (!email && !password) {
    logger.info("[admin] No admin reset requested (ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD are not set on this service).");
    return { done: false };
  }
  if (!email.includes("@") || password.length < 10) {
    logger.error("[admin] ADMIN_RESET_EMAIL must be an email and ADMIN_RESET_PASSWORD at least 10 characters. Nothing changed.");
    return { done: false };
  }
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) {
    const data = { passwordHash, status: "ACTIVE", emailVerified: true, deactivatedAt: null };
    if (!ADMIN_TIER.includes(existing.role)) data.role = "SUPER_ADMIN";
    await prisma.user.update({ where: { id: existing.id }, data });
    await prisma.refreshToken.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
    logger.warn(`[admin] Password reset for ${email} (role ${data.role || existing.role}). Remove ADMIN_RESET_* variables now.`);
    return { done: true, created: false };
  }
  await prisma.user.create({ data: { email, passwordHash, fullName: "Administrator", role: "SUPER_ADMIN", status: "ACTIVE", emailVerified: true } });
  logger.warn(`[admin] Created SUPER_ADMIN ${email}. Remove ADMIN_RESET_* variables now.`);
  return { done: true, created: true };
}

module.exports = { runAdminBootstrap };
