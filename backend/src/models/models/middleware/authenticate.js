/**
 * Authentication middleware.
 *
 * Reads the Bearer access token, verifies it, loads the current user
 * (so we always check up-to-date role/status, not just what was baked
 * into the token at login time), and attaches a minimal `req.user` to
 * the request. Rejects missing/invalid/expired tokens and suspended
 * accounts with a clean 401/403.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { verifyAccessToken } = require("../utils/jwt");

function extractBearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    return next(ApiError.unauthorized("Authentication token is required."));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    return next(ApiError.unauthorized("Invalid or expired authentication token."));
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    return next(ApiError.unauthorized("Account no longer exists."));
  }

  if (user.status === "SUSPENDED") {
    return next(ApiError.forbidden("This account has been suspended."));
  }

  // Minimal identity attached to the request — controllers/services that
  // need the full record re-fetch it explicitly.
  req.user = {
    id: user.id,
    role: user.role,
    status: user.status,
    email: user.email,
  };

  return next();
});

module.exports = authenticate;
