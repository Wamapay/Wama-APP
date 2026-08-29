/**
 * Rate limiters.
 *   - apiRateLimiter: global limiter applied to all /api routes.
 *   - authRateLimiter: stricter limiter for brute-force-sensitive
 *     endpoints (login, register, forgot-password, reset-password).
 */
"use strict";

const rateLimit = require("express-rate-limit");
const { config } = require("../config/env");

const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const authRateLimiter = rateLimit({
  windowMs: config.authRateLimit.windowMs,
  max: config.authRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  // Rate limit by IP + email (when present) so one bad actor can't lock
  // out other users sharing the same IP, while still throttling
  // credential-stuffing attempts against a single account.
  keyGenerator: (req) => `${req.ip}:${(req.body && req.body.email) || ""}`,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});

module.exports = apiRateLimiter;
module.exports.apiRateLimiter = apiRateLimiter;
module.exports.authRateLimiter = authRateLimiter;
