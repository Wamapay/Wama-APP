/**
 * Catch-all handler for unmatched API routes.
 * Must be registered AFTER all route mounts and BEFORE the error handler.
 */
"use strict";

function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
}

module.exports = notFound;
