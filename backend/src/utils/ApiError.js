/**
 * Custom application error class.
 *
 * Controllers/services should `throw new ApiError(...)` for expected,
 * well-defined failure cases (validation, auth, not found, etc.).
 * The central error handler middleware understands this shape.
 */
"use strict";

class ApiError extends Error {
  constructor(statusCode, message, details = null, isOperational = true) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational; // expected vs. programmer error
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = "Bad request", details = null) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Unauthorized", details = null) {
    return new ApiError(401, message, details);
  }

  static forbidden(message = "Forbidden", details = null) {
    return new ApiError(403, message, details);
  }

  static notFound(message = "Resource not found", details = null) {
    return new ApiError(404, message, details);
  }

  static conflict(message = "Conflict", details = null) {
    return new ApiError(409, message, details);
  }

  static validation(message = "Validation failed", details = null) {
    return new ApiError(422, message, details);
  }

  static internal(message = "Internal server error", details = null) {
    return new ApiError(500, message, details, false);
  }
}

module.exports = ApiError;
