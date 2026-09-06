/**
 * Development seed entry point — ARCHITECTURE ONLY (Backend Stage 1).
 *
 * Run with: npm run seed
 *
 * This intentionally does NOT populate a full demo dataset yet.
 * Later stages will flesh out `seedAdmin`, `seedUsers`, `seedAgents`,
 * `seedCourses`, `seedOrders`, and `seedTransactions` with real,
 * secure data (e.g. properly hashed passwords).
 */
"use strict";

const logger = require("../../config/logger");
const { prisma, connectDatabase, disconnectDatabase } = require("../client");

async function seedAdmin() {
  // TODO (later stage): create a demo Super Admin account.
  logger.info("[seed] seedAdmin() — not implemented yet.");
}

async function seedUsers() {
  // TODO (later stage): create demo User accounts.
  logger.info("[seed] seedUsers() — not implemented yet.");
}

async function seedAgents() {
  // TODO (later stage): create demo Agent accounts with referral chains.
  logger.info("[seed] seedAgents() — not implemented yet.");
}

async function seedCourses() {
  // TODO (later stage): create demo categories/courses/modules/lessons.
  logger.info("[seed] seedCourses() — not implemented yet.");
}

async function seedOrders() {
  // TODO (later stage): create demo orders + transactions.
  logger.info("[seed] seedOrders() — not implemented yet.");
}

async function main() {
  logger.info("[seed] Starting development seed (architecture placeholder)...");
  await connectDatabase();

  await seedAdmin();
  await seedUsers();
  await seedAgents();
  await seedCourses();
  await seedOrders();

  logger.info("[seed] Done.");
}

main()
  .catch((err) => {
    logger.error(`[seed] Failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });

module.exports = { seedAdmin, seedUsers, seedAgents, seedCourses, seedOrders };
