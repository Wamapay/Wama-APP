/**
 * Authentication business logic.
 *
 * Controllers stay thin — all real work (hashing, token issuance,
 * validation of business rules) lives here so it's independently
 * testable and reusable.
 */
"use strict";

const { prisma } = require("../database/client");
const { config } = require("../config/env");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");
const { hashPassword, verifyPassword } = require("../utils/password");
const { signAccessToken } = require("../utils/jwt");
const { generateRawToken, hashToken } = require("../utils/secureToken");
const { addDuration } = require("../utils/duration");
const referralService = require("./referral.service");
const emailService = require("./email.service");

const PASSWORD_RESET_TTL = "1h";
const EMAIL_VERIFICATION_TTL = "24h";

// --- Token pair issuance -----------------------------------------------

/**
 * Issue a new access token (JWT, short-lived) + refresh token (opaque,
 * DB-tracked, long-lived). The raw refresh token is returned to the
 * caller exactly once — only its hash is ever persisted.
 */
async function issueTokenPair(user) {
  const accessToken = signAccessToken({ userId: user.id, role: user.role });

  const rawRefreshToken = generateRawToken();
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = addDuration(config.jwt.refreshExpiresIn, 7 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: config.jwt.accessExpiresIn,
  };
}

/** Revoke a single refresh token (logout). Silently no-ops if unknown. */
async function revokeRefreshToken(rawRefreshToken) {
  const tokenHash = hashToken(rawRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke every active refresh token for a user (password change/reset). */
async function revokeAllUserRefreshTokens(userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// --- Registration --------------------------------------------------------

async function register({ fullName, email, phone, password, referralCode }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw ApiError.conflict("An account with this email already exists.");
  }

  let referringAgent = null;
  if (referralCode) {
    referringAgent = await referralService.findAgentByReferralCode(referralCode);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName,
        email,
        phone,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
      },
    });

    if (referringAgent) {
      await tx.referral.create({
        data: {
          agentId: referringAgent.id,
          referredUserId: created.id,
          referralCode,
          status: "REGISTERED",
        },
      });
    }

    return created;
  });

  return user;
}

// --- Login ----------------------------------------------------------------

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-shaped failure: never reveal whether the email exists.
  if (!user) {
    throw ApiError.unauthorized("Invalid email or password.");
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw ApiError.unauthorized("Invalid email or password.");
  }

  if (user.status === "SUSPENDED") {
    throw ApiError.forbidden("This account has been suspended.");
  }

  // Real enforcement (was previously missing entirely): an unverified
  // account gets no tokens at all. This intentionally runs AFTER the
  // password check (so a wrong password never reveals verification
  // status) and BEFORE any token is issued.
  if (!user.emailVerified) {
    throw ApiError.forbidden("Please verify your email before logging in.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = await issueTokenPair(user);
  return { user, tokens };
}

// --- Refresh ---------------------------------------------------------------

async function refresh(rawRefreshToken) {
  const tokenHash = hashToken(rawRefreshToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw ApiError.unauthorized("Invalid or expired refresh token.");
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user || user.status === "SUSPENDED") {
    throw ApiError.unauthorized("Invalid or expired refresh token.");
  }

  // Rotate: revoke the used refresh token and issue a fresh pair. This
  // limits the damage window if a refresh token is ever stolen.
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueTokenPair(user);
  return { user, tokens };
}

// --- Change password ---------------------------------------------------

async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw ApiError.notFound("User not found.");
  }

  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) {
    throw ApiError.badRequest("Current password is incorrect.");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await revokeAllUserRefreshTokens(userId);
}

// --- Forgot / reset password ---------------------------------------------

async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always behave the same way regardless of whether the account exists.
  if (!user) {
    logger.info(`[auth] Password reset requested for unknown email (no-op).`);
    return null;
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = addDuration(PASSWORD_RESET_TTL, 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  // Stage 2 does not integrate a real email provider. In development we
  // log the raw token so the reset flow can be exercised end-to-end;
  // a later stage wires this to an actual email service instead.
  if (!config.isProduction) {
    logger.info(`[auth][dev-only] Password reset token for ${email}: ${rawToken}`);
  }

  return { rawToken, user };
}

async function resetPassword(rawToken, newPassword) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw ApiError.badRequest("Invalid or expired reset token.");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await revokeAllUserRefreshTokens(record.userId);
}

// --- Email verification ---------------------------------------------------

/**
 * Creates a real, single-use, expiring verification token AND attempts to
 * email it via Resend. The token is always persisted first — a failed
 * send never rolls back token creation or the account itself, so the
 * person can always retry via resend-verification. Returns whether the
 * email genuinely went out so the controller can be honest about it
 * rather than always claiming success.
 */
async function issueEmailVerificationToken(user) {
  // Invalidate any still-valid earlier tokens for this user first, so a
  // resend can't leave two different working links active at once.
  await prisma.emailVerificationToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = generateRawToken();

  const tokenHash = hashToken(rawToken);
  const expiresAt = addDuration(EMAIL_VERIFICATION_TTL, 24 * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  if (!config.isProduction) {
    logger.info(`[auth][dev-only] Email verification token for user ${user.id}: ${rawToken}`);
  }

  if (!config.frontendUrl) {
    // Nothing to build a link with — never send a broken/relative URL.
    logger.error("[auth] FRONTEND_URL is not configured — cannot build a verification link.");
    return { rawToken, emailSent: false };
  }

  const verificationUrl = `${config.frontendUrl}/#/verify-email?token=${rawToken}`;
  const { sent } = await emailService.sendVerificationEmail({
    to: user.email,
    fullName: user.fullName,
    verificationUrl,
  });

  return { rawToken, emailSent: sent };
}

async function resendVerification(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) {
    // Same generic behavior as forgotPassword: don't reveal account state.
    return null;
  }
  return issueEmailVerificationToken(user);
}


async function verifyEmail(rawToken) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw ApiError.badRequest("Invalid or expired verification token.");
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
}

module.exports = {
  register,
  login,
  refresh,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  changePassword,
  forgotPassword,
  resetPassword,
  issueEmailVerificationToken,
  resendVerification,
  verifyEmail,
};
