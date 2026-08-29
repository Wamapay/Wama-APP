/**
 * Cashback: 20% of a qualifying successful course purchase, credited to
 * the BUYER's cashbackBalance. See platform rules "Cashback Calculation"
 * / "Cashback Eligibility" / "Cashback Duplicate Protection".
 *
 * Never accepts a cashback amount from the caller — always recalculated
 * from the order's server-side amount here.
 */
"use strict";

const { prisma } = require("../database/client");
const ledger = require("./ledger.service");
const { calculateCashback } = require("../utils/money");

const CASHBACK_RATE_PERCENT = 20;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function paginationArgs(query) {
  const take = Math.min(parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { take, skip: (page - 1) * take, page };
}

function dateRangeWhere(from, to) {
  if (!from && !to) return undefined;
  const range = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) range.lte = d;
  }
  return Object.keys(range).length ? range : undefined;
}

/**
 * Award cashback for a PAID order, inside the caller's transaction.
 * Idempotent — calling this twice for the same order never creates a
 * second CASHBACK transaction or double-credits the balance (see
 * ledger.service.js).
 */
async function awardCashback(tx, order) {
  const amount = calculateCashback(order.amount);

  const { transaction, created } = await ledger.recordTransaction(tx, {
    userId: order.userId,
    type: "CASHBACK",
    amount,
    currency: order.currency,
    status: "SUCCESSFUL",
    balanceType: "CASHBACK",
    referenceType: "ORDER",
    referenceId: order.id,
    description: `Cashback (${CASHBACK_RATE_PERCENT}%) for order ${order.orderNumber}`,
    applyBalance: true,
  });

  return { transaction, created, amount };
}

async function listCashbackHistory(userId, query = {}) {
  const { take, skip, page } = paginationArgs(query);

  const where = { userId, type: "CASHBACK" };
  if (query.status) where.status = query.status;
  const createdAt = dateRangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({ where, take, skip, orderBy: { createdAt: "desc" } }),
    prisma.transaction.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

module.exports = { CASHBACK_RATE_PERCENT, awardCashback, listCashbackHistory };
