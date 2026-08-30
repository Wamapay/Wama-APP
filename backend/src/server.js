/**
 * Application entry point.
 * Responsible for: validating config, connecting to the database
 * (if configured), starting the HTTP server, and graceful shutdown.
 */
"use strict";

const app = require("./app");
const { config, assertCriticalConfig } = require("./config/env");
const logger = require("./config/logger");
const { connectDatabase, disconnectDatabase } = require("./database/client");

assertCriticalConfig();

let server;

async function start() {
  // Attempt a database connection if DATABASE_URL is present.
  // Stage 1 must still be able to start the HTTP server even without
  // a database configured yet — it just reports the situation clearly.
  if (config.database.url) {
    try {
      await connectDatabase();
      logger.info("[database] Connected to PostgreSQL successfully.");
    } catch (err) {
      logger.error(`[database] Failed to connect: ${err.message}`);
      logger.warn("[database] Server will continue starting, but database-backed routes will fail.");
    }
  } else {
    logger.warn(
      "[database] DATABASE_URL is not set. Skipping database connection — configure it in .env when ready."
    );
  }

  server = app.listen(config.port, () => {
    logger.info(`[server] Environment: ${config.env}`);
    logger.info(`[server] Listening on port ${config.port}`);
    logger.info(`[server] Health check: http://localhost:${config.port}${config.apiPrefix}/health`);
  });
}

async function shutdown(signal) {
  logger.info(`[server] Received ${signal}. Shutting down gracefully...`);
  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info("[server] HTTP server closed.");
    }
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error(`[server] Error during shutdown: ${err.message}`);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error(`[process] Unhandled promise rejection: ${reason}`);
});

process.on("uncaughtException", (err) => {
  logger.error(`[process] Uncaught exception: ${err.stack || err.message}`);
  // Exit — an uncaught exception leaves the process in an unknown state.
  process.exit(1);
});

start();

module.exports = { start, shutdown };
