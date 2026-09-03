/**
 * Express application setup.
 * Kept separate from server.js so the app can be imported directly
 * in tests (supertest) without binding to a real port.
 */
"use strict";

const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");

const { config } = require("./config/env");
const logger = require("./config/logger");
const cors = require("./middleware/corsConfig");
const apiRateLimiter = require("./middleware/rateLimiter");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");
const routes = require("./routes");

const app = express();

// Trust the first proxy hop (needed for correct req.ip / rate limiting
// behind Nginx, Render, Railway, Heroku, etc.)
app.set("trust proxy", 1);

// --- Security & core middleware ---
app.use(helmet());
app.use(cors);
app.use(compression());

// --- Body parsing ---
// `verify` captures the exact raw bytes of the request body onto
// `req.rawBody` for every request. This is required by the Paystack
// webhook route (Backend Stage 5), which must verify the
// x-paystack-signature header as an HMAC over the RAW body — a
// re-serialized `JSON.stringify(req.body)` can differ (key order,
// whitespace) and silently break signature verification. Capturing it
// globally here is simpler and safer than special-casing the webhook
// route's body-parsing middleware, and has no effect on any other route.
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// --- Request logging ---
if (!config.isTest) {
  const morganFormat = config.isProduction ? "combined" : "dev";
  app.use(
    morgan(morganFormat, {
      stream: { write: (message) => logger.http(message.trim()) },
    })
  );
}

// --- Rate limiting (applies to all /api routes) ---
app.use(config.apiPrefix, apiRateLimiter);

// --- Root ---
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Platform backend is running. See /api/v1/health for status.",
    data: { apiPrefix: config.apiPrefix },
  });
});

// --- API routes ---
app.use(config.apiPrefix, routes);

// --- 404 + centralized error handling (must be last) ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;
