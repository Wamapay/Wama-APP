/**
 * Rate limiters.
 *   - apiRateLimiter: global limiter applied to all /api routes.
 *   - authRateLimiter: stricter limiter for brute-force-sensitive
 *     endpoints (login, register, forgot-password, reset-password).
 *
 * Shared store across replicas: by default, express-rate-limit counts
 * hits in each process's own memory — correct for a single instance,
 * but each Railway replica would then keep its own separate count
 * (e.g. 3 replicas effectively triples the real limit an attacker can
 * get through). When REDIS_URL is set (Railway's Redis add-on sets
 * this automatically once provisioned), every replica counts against
 * the SAME shared store instead, so the limit means what it says
 * regardless of how many replicas are running. With no REDIS_URL set,
 * this falls back to the original in-memory behavior — safe for a
 * single instance, and the whole app keeps working normally either way.
 */
"use strict";

const rateLimit = require("express-rate-limit");
const { config } = require("../config/env");
const logger = require("../config/logger");

let sharedStoreFactory = null; // (prefix) => Store | undefined
if (config.redis.url) {
  try {
    const Redis = require("ioredis");
    const { RedisStore } = require("rate-limit-redis");

    const redisClient = new Redis(config.redis.url, {
      // Never let a Redis outage take the whole app down — retry
      // quietly in the background; requests just fall through to
      // express-rate-limit's own error handling in the meantime.
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    redisClient.on("error", (err) => {
      logger.error(`[rateLimiter] Redis connection error: ${err.message}`);
    });

    sharedStoreFactory = (prefix) =>
      new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
        prefix,
      });

    logger.info("[rateLimiter] Using shared Redis store — rate limits are now consistent across all replicas.");
  } catch (err) {
    logger.error(`[rateLimiter] Failed to initialize Redis store, falling back to in-memory: ${err.message}`);
    sharedStoreFactory = null;
  }
}

const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  ...(sharedStoreFactory ? { store: sharedStoreFactory("api:") } : {}),
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
  ...(sharedStoreFactory ? { store: sharedStoreFactory("auth:") } : {}),
  // Rate limit by IP + email (when present) so one bad actor can't lock
  // out other users sharing the same IP, while still throttling
  // credential-stuffing attempts against a single account.
  keyGenerator: (req) => `${req.ip}:${(req.body && req.body.email) || ""}`,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});

// Community chat — basic flood/spam protection. Keyed by the real
// authenticated user (never IP alone), since sending a message always
// requires being logged in — this stops one account from spamming the
// shared room regardless of how many people share their network.
const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15, // 15 messages per minute — generous for real conversation, blocks flooding
  standardHeaders: true,
  legacyHeaders: false,
  ...(sharedStoreFactory ? { store: sharedStoreFactory("chat:") } : {}),
  keyGenerator: (req) => (req.user && req.user.id) || req.ip,
  message: {
    success: false,
    message: "You're sending messages too quickly. Please slow down.",
  },
});

module.exports = apiRateLimiter;
module.exports.apiRateLimiter = apiRateLimiter;
module.exports.authRateLimiter = authRateLimiter;
module.exports.chatRateLimiter = chatRateLimiter;
