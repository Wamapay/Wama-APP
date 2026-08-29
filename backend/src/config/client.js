/**
 * Prisma client singleton + connection helpers.
 *
 * Database access is isolated here (and inside future repository/service
 * files) — routes and controllers must never import PrismaClient directly.
 */
"use strict";

const { PrismaClient } = require("@prisma/client");
const { config } = require("../config/env");

// Avoid creating multiple PrismaClient instances during dev hot-reloads.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: config.isDevelopment ? ["warn", "error"] : ["error"],
  });

if (!config.isProduction) {
  globalForPrisma.__prisma = prisma;
}

async function connectDatabase() {
  await prisma.$connect();
}

async function disconnectDatabase() {
  await prisma.$disconnect();
}

module.exports = { prisma, connectDatabase, disconnectDatabase };
