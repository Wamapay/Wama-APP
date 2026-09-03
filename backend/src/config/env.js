/**
 * Centralized environment configuration.
 *
 * This module loads process.env ONCE and exposes a clean, typed
 * configuration object. No other file in the application should
 * read `process.env` directly — everything should import `config`
 * from here instead.
 */
"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const toInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toList = (value) =>
  (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const NODE_ENV = process.env.NODE_ENV || "development";

const config = {
  env: NODE_ENV,
  isProduction: NODE_ENV === "production",
  isDevelopment: NODE_ENV === "development",
  isTest: NODE_ENV === "test",

  port: toInt(process.env.PORT, 5000),
  apiVersion: "v1",
  apiPrefix: "/api/v1",

  database: {
    url: process.env.DATABASE_URL || "",
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },

  // Canonical public URL of the main frontend, used to build referral
  // links AND the email-verification link sent via Resend.
  frontendUrl: process.env.FRONTEND_URL || "",

  // Real transactional email — Resend (see src/services/email.service.js).
  // The API key is server-side only: read here, never logged, never sent
  // to any frontend or API response.
  email: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    // "Name <email@domain>" or a bare address. For a domain that hasn't
    // been verified in Resend yet, use their sandbox sender
    // "onboarding@resend.dev" — Resend accepts sends from that address
    // without any domain verification, which is why it's the suggested
    // default in .env.example rather than hardcoded here.
    from: process.env.EMAIL_FROM || "",
  },

  cors: {
    // Additional comma-separated origins can be supplied via CORS_EXTRA_ORIGINS
    // e.g. CORS_EXTRA_ORIGINS=http://localhost:5173,http://localhost:5174
    allowedOrigins: [
      process.env.FRONTEND_URL,
      process.env.ADMIN_FRONTEND_URL,
      ...toList(process.env.CORS_EXTRA_ORIGINS),
    ].filter(Boolean),
  },

  // Backend Stage 5: Paystack. The secret key NEVER leaves this backend —
  // never returned in a response, never logged. See payment.service.js /
  // paystack.service.js.
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || "",
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
    baseUrl: process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
    // Where Paystack redirects the browser after checkout. The backend
    // never treats this as proof of payment — see docs/API_STAGE5.md.
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL || "",
    // Paystack signs webhooks with the SECRET key itself (HMAC-SHA512),
    // not a separate signing secret — but some deployments front the
    // webhook with an extra shared secret/proxy check, so this is kept
    // optional and additive, never a replacement for the signature check.
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || "",
    // Reasonable upper bound on any single call to the Paystack API —
    // never let a gateway request hang indefinitely (see "Timeouts").
    requestTimeoutMs: toInt(process.env.PAYSTACK_REQUEST_TIMEOUT_MS, 15000),
  },

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000), // 15 min
    max: toInt(process.env.RATE_LIMIT_MAX_REQUESTS, 300),
  },

  authRateLimit: {
    windowMs: toInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000), // 15 min
    max: toInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
  },

  // Dev-only routes (e.g. simulating a qualifying purchase to test Agent
  // creation) must never be reachable in production regardless of this flag.
  enableDevRoutes: process.env.ENABLE_DEV_ROUTES === "true" && NODE_ENV !== "production",
};

/**
 * Fail loudly (but safely) in production if critical secrets are missing.
 * In development we warn instead of crashing, since Stage 1 does not yet
 * require these values to run the server.
 */
function assertCriticalConfig() {
  const missing = [];

  if (config.isProduction) {
    if (!config.database.url) missing.push("DATABASE_URL");
    if (!config.jwt.accessSecret) missing.push("JWT_ACCESS_SECRET");
    if (!config.jwt.refreshSecret) missing.push("JWT_REFRESH_SECRET");
    if (!process.env.FRONTEND_URL) missing.push("FRONTEND_URL");
    if (!process.env.PAYSTACK_SECRET_KEY) missing.push("PAYSTACK_SECRET_KEY");
    if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
    if (!process.env.EMAIL_FROM) missing.push("EMAIL_FROM");

    if (missing.length) {
      // eslint-disable-next-line no-console
      console.error(
        `[config] Missing required environment variables in production: ${missing.join(", ")}`
      );
      process.exit(1);
    }
  }
}

module.exports = { config, assertCriticalConfig };
