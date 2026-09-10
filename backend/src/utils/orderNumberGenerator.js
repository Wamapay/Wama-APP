/**
 * Human-readable, unique Order number generation.
 * Format: ORD-YYYYMMDD-NNNNNN (e.g. "ORD-20260822-000001").
 *
 * The sequence portion is derived from how many orders already exist for
 * today, with retry-forward-on-collision so concurrent order creation
 * (like agentIdGenerator's approach for Agent IDs) can never produce a
 * duplicate order number.
 */
"use strict";

function todayStamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatOrderNumber(stamp, sequence) {
  return `ORD-${stamp}-${String(sequence).padStart(6, "0")}`;
}

module.exports = { todayStamp, formatOrderNumber };
