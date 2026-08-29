/**
 * Secure opaque token helpers, used for:
 *   - refresh tokens
 *   - password reset tokens
 *   - email verification tokens
 *
 * Pattern: generate a random raw token, send/return the RAW token to the
 * client, but only ever persist a SHA-256 hash of it in the database.
 * This means a database read alone can never be used to impersonate a
 * user or reset a password — the raw token is never stored.
 */
"use strict";

const crypto = require("crypto");

function generateRawToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

module.exports = { generateRawToken, hashToken };
