/**
 * Minimal duration string parser: "15m", "7d", "1h", "30s", or a bare
 * number of milliseconds. Only used for translating JWT_*_EXPIRES_IN
 * env values into a concrete Date for database-tracked tokens.
 */
"use strict";

const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function parseDurationMs(value, fallbackMs = 15 * 60 * 1000) {
  if (typeof value === "number") return value;
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(String(value || "").trim());
  if (!match) return fallbackMs;
  const amount = parseInt(match[1], 10);
  const unit = (match[2] || "ms").toLowerCase();
  if (unit === "ms") return amount;
  return amount * (UNIT_MS[unit] || 1);
}

function addDuration(value, fallbackMs) {
  return new Date(Date.now() + parseDurationMs(value, fallbackMs));
}

module.exports = { parseDurationMs, addDuration };
