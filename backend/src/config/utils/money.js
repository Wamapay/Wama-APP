/**
 * Money-safe arithmetic. Never use native floating-point math (`*`, `+`,
 * `-` on JS `number`) for financial calculations — see platform rule
 * "Money Precision". Everything here is built on `decimal.js`, the exact
 * same arbitrary-precision Decimal library Prisma itself uses internally
 * and re-exports as `Prisma.Decimal` for `@db.Decimal` fields — a
 * `Decimal` instance from here is accepted anywhere Prisma expects a
 * Decimal value, and any Decimal Prisma returns from the database can be
 * passed straight into these helpers.
 */
"use strict";

const Decimal = require("decimal.js");

// Course cashback / referral commission rates — see platform business
// rules. Expressed as strings so Decimal parses them exactly (no
// intermediate float).
const CASHBACK_RATE = "0.20";
const COMMISSION_RATE = "0.40";

function toDecimal(value) {
  if (value instanceof Decimal) return value;
  return new Decimal(value === null || value === undefined ? 0 : value);
}

/** amount * rate, rounded to 2dp (half-up) — the only rounding rule used platform-wide. */
function percentOf(amount, rate) {
  return toDecimal(amount).times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function calculateCashback(amount) {
  return percentOf(amount, CASHBACK_RATE);
}

function calculateCommission(amount) {
  return percentOf(amount, COMMISSION_RATE);
}

function add(a, b) {
  return toDecimal(a).plus(toDecimal(b));
}

function subtract(a, b) {
  return toDecimal(a).minus(toDecimal(b));
}

function isPositive(value) {
  return toDecimal(value).gt(0);
}

function isGreaterThan(a, b) {
  return toDecimal(a).gt(toDecimal(b));
}

/** Exact equality for two money values — the only correct way to compare amounts (never `===` on floats/strings). */
function equals(a, b) {
  return toDecimal(a).equals(toDecimal(b));
}

/**
 * Convert a major-unit amount (e.g. GHS 500.00) to the integer subunit
 * value Paystack's API requires (e.g. 50000 pesewas) — see
 * "Sending an amount in subunits simply means multiplying the base
 * amount by 100" (Paystack API docs). Always goes through Decimal, never
 * native float multiplication, to avoid the classic ×100 rounding bug.
 */
function toSubunit(amount) {
  return Number(toDecimal(amount).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
}

/** Convert a Paystack subunit integer amount back to a major-unit Decimal (e.g. 50000 -> 500.00). */
function fromSubunit(subunitAmount) {
  return toDecimal(subunitAmount).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Convert a Decimal (or Decimal-like) to a plain JS number for API responses only — never for further calculation. */
function toNumber(value) {
  if (value === null || value === undefined) return value;
  return Number(toDecimal(value));
}

module.exports = {
  CASHBACK_RATE,
  COMMISSION_RATE,
  toDecimal,
  percentOf,
  calculateCashback,
  calculateCommission,
  add,
  subtract,
  isPositive,
  isGreaterThan,
  equals,
  toSubunit,
  fromSubunit,
  toNumber,
};
