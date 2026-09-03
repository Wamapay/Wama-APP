/**
 * Central request validation middleware.
 * See src/validators/README.md for the pattern this implements.
 */
"use strict";

const ApiError = require("../utils/ApiError");

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  if (!result.success) {
    return next(ApiError.validation("Validation failed", result.error.flatten()));
  }

  // Use the parsed (and coerced/defaulted) data going forward.
  req.body = result.data.body ?? req.body;
  req.query = result.data.query ?? req.query;
  req.params = result.data.params ?? req.params;

  return next();
};

module.exports = validate;
