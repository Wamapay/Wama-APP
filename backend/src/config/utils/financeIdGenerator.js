/**
 * Human-readable, unique ID generation for financial records
 * (Transaction.transactionId, Withdrawal.withdrawalId), mirroring the
 * same "count today + retry-forward-on-collision" pattern already used
 * for Order numbers (see orderNumberGenerator.js) and Agent IDs (see
 * agentIdGenerator.js) — kept as a small shared helper instead of
 * duplicating the day-stamp logic a third time.
 *
 * Format: "<PREFIX>-YYYYMMDD-NNNNNN", e.g. "TXN-20260822-000001".
 */
"use strict";

const { todayStamp } = require("./orderNumberGenerator");

function formatId(prefix, stamp, sequence) {
  return `${prefix}-${stamp}-${String(sequence).padStart(6, "0")}`;
}

module.exports = { todayStamp, formatId };
