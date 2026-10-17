/**
 * Applies the idempotent SQL files in /prisma (creator_store.sql, shop.sql)
 * every time the server starts, so a fresh deploy never needs a manual
 * database step. Every statement is "IF NOT EXISTS"/duplicate-safe, so
 * re-running is harmless. Disable with AUTO_MIGRATE=false.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const FILES = ["creator_store.sql", "shop.sql"]; // order matters (shop is independent, creator first)

/** Split SQL into statements on ';' while ignoring ';' inside $$ ... $$ blocks and comments. */
function splitStatements(sql) {
  const cleaned = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const out = [];
  let cur = "";
  let inDollar = false;
  for (let i = 0; i < cleaned.length; i += 1) {
    if (cleaned[i] === "$" && cleaned[i + 1] === "$") {
      inDollar = !inDollar;
      cur += "$$";
      i += 1;
    } else if (cleaned[i] === ";" && !inDollar) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += cleaned[i];
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function runAutoMigrate(prisma, logger, dir = path.join(__dirname, "..", "..", "prisma")) {
  let applied = 0;
  let failed = 0;
  for (const file of FILES) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) { logger.warn(`[migrate] ${file} not found, skipping.`); continue; }
    for (const stmt of splitStatements(fs.readFileSync(full, "utf8"))) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await prisma.$executeRawUnsafe(stmt);
        applied += 1;
      } catch (err) {
        failed += 1;
        logger.error(`[migrate] ${file}: ${err.message.split("\n").slice(-1)[0]} | ${stmt.slice(0, 80).replace(/\s+/g, " ")}`);
      }
    }
  }
  logger.info(`[migrate] Database update finished: ${applied} statements ok, ${failed} failed.`);
  return { applied, failed };
}

module.exports = { runAutoMigrate, splitStatements };
