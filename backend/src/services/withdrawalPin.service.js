/**
 * Withdrawal PIN — a 4-digit PIN required as the final step of any
 * withdrawal, separate from the account password. Never stored in
 * plain text (hashed via the same utility as the password).
 *
 * Real brute-force protection matters here specifically because a
 * 4-digit PIN only has 10,000 possible values — hashing alone doesn't
 * meaningfully protect against someone with API access simply trying
 * every combination. After MAX_FAILED_ATTEMPTS wrong guesses in a row,
 * PIN verification is locked for LOCKOUT_DURATION_MS; a single correct
 * entry resets the failure count to zero.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const { hashPassword, verifyPassword } = require("../utils/password");

const PIN_REGEX = /^\d{4}$/;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function validatePinFormat(pin) {
  if (typeof pin !== "string" || !PIN_REGEX.test(pin)) {
    throw ApiError.badRequest("PIN must be exactly 4 digits.");
  }
}

/**
 * Sets a NEW PIN, or changes an existing one — same operation either
 * way. Requires the account password to confirm identity, exactly like
 * changing the login email.
 */
async function setWithdrawalPin(userId, pin, currentPassword) {
  validatePinFormat(pin);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found.");

  const passwordMatches = await verifyPassword(currentPassword || "", user.passwordHash);
  if (!passwordMatches) {
    throw ApiError.unauthorized("Current password is incorrect.");
  }

  const pinHash = await hashPassword(pin);
  await prisma.user.update({
    where: { id: userId },
    data: { withdrawalPinHash: pinHash, withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null },
  });

  return { set: true };
}

async function hasWithdrawalPin(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { withdrawalPinHash: true } });
  if (!user) throw ApiError.notFound("User not found.");
  return Boolean(user.withdrawalPinHash);
}

/**
 * Called from withdrawal.service.js as part of creating a withdrawal.
 * Throws a clear, specific error in every failure case — never a
 * silent pass. A locked-out account gets a clear "try again at X"
 * message rather than a generic "wrong PIN" that would let someone
 * keep guessing indefinitely.
 */
async function verifyWithdrawalPin(userId, pin) {
  validatePinFormat(pin);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found.");

  if (!user.withdrawalPinHash) {
    throw ApiError.badRequest("You haven't set a withdrawal PIN yet. Set one in your account security settings before withdrawing.");
  }

  if (user.withdrawalPinLockedUntil && new Date(user.withdrawalPinLockedUntil) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.withdrawalPinLockedUntil) - new Date()) / 60000);
    throw ApiError.forbidden(`Too many incorrect PIN attempts. Try again in about ${minutesLeft} minute(s).`);
  }

  const matches = await verifyPassword(pin, user.withdrawalPinHash);

  if (!matches) {
    const failedAttempts = (user.withdrawalPinFailedAttempts || 0) + 1;
    const data = { withdrawalPinFailedAttempts: failedAttempts };
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      data.withdrawalPinLockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    }
    await prisma.user.update({ where: { id: userId }, data });

    if (data.withdrawalPinLockedUntil) {
      throw ApiError.forbidden(`Too many incorrect PIN attempts. Your withdrawal PIN is locked for 30 minutes.`);
    }
    throw ApiError.unauthorized(`Incorrect PIN. ${MAX_FAILED_ATTEMPTS - failedAttempts} attempt(s) remaining before a temporary lock.`);
  }

  // Correct PIN — always reset the failure count, regardless of what it was.
  if (user.withdrawalPinFailedAttempts > 0 || user.withdrawalPinLockedUntil) {
    await prisma.user.update({ where: { id: userId }, data: { withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null } });
  }
}

module.exports = { setWithdrawalPin, hasWithdrawalPin, verifyWithdrawalPin, MAX_FAILED_ATTEMPTS };
