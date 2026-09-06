/**
 * Wraps an async Express route/controller so rejected promises are
 * forwarded to the centralized error handler instead of crashing
 * the process or requiring a try/catch in every controller.
 *
 * Usage:
 *   router.get("/", asyncHandler(async (req, res) => { ... }));
 */
"use strict";

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
