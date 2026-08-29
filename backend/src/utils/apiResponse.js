/**
 * Standardized API response helpers.
 * Every route/controller in the application should respond using these
 * helpers so the API shape is always consistent for the frontends.
 */
"use strict";

class ApiResponse {
  static success(res, { statusCode = 200, message = "Request successful", data = {} } = {}) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  static error(res, { statusCode = 500, message = "Something went wrong", error = null } = {}) {
    return res.status(statusCode).json({
      success: false,
      message,
      error,
    });
  }
}

module.exports = ApiResponse;
