/**
 * JWT access-token helpers.
 *
 * Refresh tokens are NOT JWTs in this architecture — they are opaque
 * random strings tracked in the `refresh_tokens` table (see
 * utils/secureToken.js and services/auth.service.js), which allows
 * individual revocation. Only the short-lived access token is a JWT.
 *
 * The access token payload intentionally contains only identity
 * information (userId, role) — never password, balance, commission,
 * or other financial/sensitive data.
 */
"use strict";

const jwt = require("jsonwebtoken");
const { config } = require("../config/env");

function signAccessToken({ userId, role }) {
  return jwt.sign({ sub: userId, role }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

module.exports = { signAccessToken, verifyAccessToken };
