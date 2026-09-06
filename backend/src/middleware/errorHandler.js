/**
 * Centralized Express error handler.
 *
 * Handles:
 *  - ApiError instances (validation, auth, not found, etc.)
 *  - Prisma/database errors (recognized by `code` shape)
 *  - JSON body parsing errors
 *  - Any unexpected/unhandled error
 *
 * Never leaks stack traces or internal details in production.
 */
"use strict";

const { config } = require("../config/env");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = 500;
  let message = "Something went wrong";
  let details = null;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err.type === "entity.parse.failed") {
    // Malformed JSON body
    statusCode = 400;
    message = "Malformed JSON in request body";
  } else if (err.name === "PrismaClientKnownRequestError") {
    // Database constraint / query errors — keep details generic externally
    statusCode = 400;
    message = "Database request could not be processed";
  } else if (err.name === "PrismaClientValidationError") {
    statusCode = 400;
    message = "Invalid data provided to the database layer";
  } else if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Invalid or expired authentication token";
  }

  const isOperational = err instanceof ApiError ? err.isOperational : false;

  // Log full detail server-side always; never send stack/internals to client
  // in production.
  if (statusCode >= 500 || !isOperational) {
    logger.error(err.stack || err.message || "Unknown error");
  } else {
    logger.warn(`${statusCode} ${message}`);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    error: config.isProduction
      ? details
      : {
          details,
          stack: err.stack,
        },
  });
}

module.exports = errorHandler;
