/**
 * Like authenticate.js, but never rejects the request when no/invalid
 * token is present — it just leaves req.user unset. Used for endpoints
 * that behave differently for logged-in vs anonymous users without
 * requiring login (e.g. course content, where preview lessons are public
 * but everything else needs a real access check).
 */
"use strict";

const { prisma } = require("../database/client");
const asyncHandler = require("../utils/asyncHandler");
const { verifyAccessToken } = require("../utils/jwt");

function extractBearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    return next(); // invalid/expired token -> treat as anonymous
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status === "SUSPENDED") {
    return next();
  }

  req.user = { id: user.id, role: user.role, status: user.status, email: user.email };
  return next();
});

module.exports = optionalAuthenticate;
