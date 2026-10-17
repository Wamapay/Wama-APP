"use strict";

const ApiError = require("../utils/ApiError");
const { prisma } = require("../database/client");

/**
 * Only Creator-store accounts may use /creator/* routes. accountType is
 * read from the database on every request (never from the token or the
 * client), so it can't be spoofed.
 */
async function requireCreator(req, res, next) {
  try {
    if (!req.user) return next(ApiError.unauthorized("Authentication required."));
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, accountType: true, fullName: true } });
    if (!user || user.accountType !== "CREATOR") {
      return next(ApiError.forbidden("This area is only for Creator Store accounts."));
    }
    req.creator = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = requireCreator;
