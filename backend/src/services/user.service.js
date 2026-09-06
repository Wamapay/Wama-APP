"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const agentService = require("./agent.service");
const { verifyPassword } = require("../utils/password");

async function getUserWithAgent(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw ApiError.notFound("User not found.");
  }
  const agent = await agentService.getAgentByUserId(userId);
  return { ...user, agent };
}

// Only fullName/phone/profileImage may be self-edited. role, status,
// verification, commission/cashback/reward, and Agent identifiers are
// deliberately never accepted here — they're controlled by backend
// business logic elsewhere.
async function updateProfile(userId, updates) {
  const allowed = {};
  if (updates.fullName !== undefined) allowed.fullName = updates.fullName;
  if (updates.phone !== undefined) allowed.phone = updates.phone;
  if (updates.profileImage !== undefined) allowed.profileImage = updates.profileImage;

  // Changing your own login email is more sensitive than the other
  // fields above — requires re-entering your current password (same
  // real check auth.service.js's changePassword uses), and never
  // silently hands the account to a duplicate/typo'd email. We
  // deliberately do NOT reset emailVerified here — since login
  // requires a verified email, doing so would risk locking someone
  // (including an admin) out of their own account immediately after
  // changing it, before they've had a chance to check the new inbox.
  //
  // IMPORTANT: the password is only required when the email is
  // ACTUALLY changing. A form that always includes the user's current
  // email in every save (re-submitting the same value unchanged) must
  // never be blocked just because the `email` field happened to be
  // present — that would break ordinary profile saves for everyone.
  if (updates.email !== undefined) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound("User not found.");

    if (updates.email !== user.email) {
      const passwordMatches = await verifyPassword(updates.currentPassword || "", user.passwordHash);
      if (!passwordMatches) {
        throw ApiError.unauthorized("Current password is incorrect.");
      }

      const existing = await prisma.user.findUnique({ where: { email: updates.email } });
      if (existing) {
        throw ApiError.conflict("That email is already in use by another account.");
      }
      allowed.email = updates.email;
    }
    // else: email unchanged — a genuine no-op, no password needed.
  }

  const user = await prisma.user.update({ where: { id: userId }, data: allowed });
  const agent = await agentService.getAgentByUserId(userId);
  return { ...user, agent };
}

// Real, saved notification preferences — email categories only (no SMS
// section: that would need a real SMS provider, which doesn't exist).
// Honest limitation, stated plainly: these are stored for real, but
// don't yet gate anything automatic, since no event-triggered
// notification system exists yet — see notification.service.js.
const NOTIFICATION_PREFERENCE_KEYS = [
  "orderReceipts",
  "cashbackEarned",
  "withdrawalStatus",
  "courseUpdates",
  "referralActivity",
  "weeklySummary",
  "promotions",
];

const DEFAULT_NOTIFICATION_PREFERENCES = {
  orderReceipts: true,
  cashbackEarned: true,
  withdrawalStatus: true,
  courseUpdates: true,
  referralActivity: true,
  weeklySummary: false,
  promotions: false,
};

async function getNotificationPreferences(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { notificationPreferences: true } });
  if (!user) throw ApiError.notFound("User not found.");
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(user.notificationPreferences || {}) };
}

async function updateNotificationPreferences(userId, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw ApiError.badRequest("Preferences must be an object of preference-name -> boolean.");
  }
  const unknownKeys = Object.keys(patch).filter((k) => !NOTIFICATION_PREFERENCE_KEYS.includes(k));
  if (unknownKeys.length > 0) {
    throw ApiError.badRequest(`Unknown preference key(s): ${unknownKeys.join(", ")}.`);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== "boolean") {
      throw ApiError.badRequest(`${key} must be true or false.`);
    }
  }

  const current = await getNotificationPreferences(userId);
  const merged = { ...current, ...patch };
  await prisma.user.update({ where: { id: userId }, data: { notificationPreferences: merged } });
  return merged;
}

const PROFILE_VISIBILITY_KEYS = ["leaderboard", "certificateVisible", "communityProfile"];

const DEFAULT_PROFILE_VISIBILITY = {
  leaderboard: true,
  certificateVisible: true,
  communityProfile: true,
};

async function getProfileVisibility(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { profileVisibility: true } });
  if (!user) throw ApiError.notFound("User not found.");
  return { ...DEFAULT_PROFILE_VISIBILITY, ...(user.profileVisibility || {}) };
}

async function updateProfileVisibility(userId, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw ApiError.badRequest("Preferences must be an object of preference-name -> boolean.");
  }
  const unknownKeys = Object.keys(patch).filter((k) => !PROFILE_VISIBILITY_KEYS.includes(k));
  if (unknownKeys.length > 0) {
    throw ApiError.badRequest(`Unknown preference key(s): ${unknownKeys.join(", ")}.`);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== "boolean") {
      throw ApiError.badRequest(`${key} must be true or false.`);
    }
  }

  const current = await getProfileVisibility(userId);
  const merged = { ...current, ...patch };
  await prisma.user.update({ where: { id: userId }, data: { profileVisibility: merged } });
  return merged;
}

/**
 * Real self-service deactivation — requires the account password to
 * confirm identity, same pattern as changing email/PIN. Separate from
 * admin suspend/activate: reactivating just means logging back in (see
 * auth.service.js login(), which clears deactivatedAt automatically).
 */
async function deactivateAccount(userId, currentPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found.");

  const passwordMatches = await verifyPassword(currentPassword || "", user.passwordHash);
  if (!passwordMatches) {
    throw ApiError.unauthorized("Current password is incorrect.");
  }

  await prisma.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
  return { deactivated: true };
}

module.exports = {
  getUserWithAgent,
  updateProfile,
  getNotificationPreferences,
  updateNotificationPreferences,
  NOTIFICATION_PREFERENCE_KEYS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  getProfileVisibility,
  updateProfileVisibility,
  PROFILE_VISIBILITY_KEYS,
  DEFAULT_PROFILE_VISIBILITY,
  deactivateAccount,
};