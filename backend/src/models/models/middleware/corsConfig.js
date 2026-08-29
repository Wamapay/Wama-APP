/**
 * CORS configuration.
 *
 * Restricts cross-origin access to known frontend origins (main platform
 * and admin dashboard), configured via FRONTEND_URL / ADMIN_FRONTEND_URL
 * (and optional CORS_EXTRA_ORIGINS) in the environment.
 *
 * In development, if no origins are configured at all, we fall back to
 * allowing all origins so local setup isn't blocked — this fallback is
 * intentionally disabled in production.
 */
"use strict";

const cors = require("cors");
const { config } = require("../config/env");
const logger = require("../config/logger");

const { allowedOrigins } = config.cors;

if (!allowedOrigins.length) {
  if (config.isProduction) {
    logger.warn(
      "[cors] No allowed origins configured in production. All cross-origin requests will be rejected until FRONTEND_URL / ADMIN_FRONTEND_URL are set."
    );
  } else {
    logger.warn(
      "[cors] No FRONTEND_URL / ADMIN_FRONTEND_URL configured — allowing all origins in development only."
    );
  }
}

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser requests (curl, server-to-server, health checks)
    if (!origin) return callback(null, true);

    if (!allowedOrigins.length && !config.isProduction) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin "${origin}" is not allowed by CORS`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

module.exports = cors(corsOptions);
