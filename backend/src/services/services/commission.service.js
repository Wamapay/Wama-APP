/**
 * Commission: 40% of a qualifying successful REFERRED course purchase,
 * credited to the referring Agent's user commissionBalance. See platform
 * rules "Commission Calculation" / "Commission Eligibility" /
 * "Self-Referral Protection".
 *
 * Never accepts a commission amount from the caller — always
 * recalculated from the order's server-side amount here. No commission
 * (and no successful referral) is ever created for a purchase with no
 * valid, non-self referral attribution.
 */
"use strict";

const { prisma } = require("../database/client");
const referralService = require("./referral.service");
const ledger = require("./ledger.service");
const { calculateCommission } = require("../utils/money");

const COMMISSION_RATE_PERCENT = 40;

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
 * Attempt to award commission for a PAID order, inside the caller's
 * transaction. No-op (returns nulls) when there's no valid referral to
 * complete — see referralService.resolveReferralForOrder for exactly
 * which cases that covers (no code used, already processed, self-referral).
 *
 * When a valid referral IS resolved, this function is what:
 *   - marks the Referral SUCCESSFUL
 *   - increments Agent.successfulReferrals
 *   - creates the COMMISSION transaction and credits the Agent's user
 * all atomically, inside `tx`.
 */
async function awardCommission(tx, order) {
  const referral = await referralService.resolveReferralForOrder(tx, order);
  if (!referral) {
    return { transaction: null, referral: null, agent: null, amount: null };
  }

  const amount = calculateCommission(order.amount);

  const agent = await tx.agent.update({
    where: { id: referral.agentId },
    data: { successfulReferrals: { increment: 1 } },
  });

  const updatedReferral = await referralService.markReferralSuccessful(tx, {
    referralId: referral.id,
    orderId: order.id,
  });

  const { transaction } = await ledger.recordTransaction(tx, {
    userId: agent.userId,
    type: "COMMISSION",
    amount,
    currency: order.currency,
    status: "SUCCESSFUL",
    balanceType: "COMMISSION",
    referenceType: "ORDER",
    referenceId: order.id,
    description: `Referral commission (${COMMISSION_RATE_PERCENT}%) for order ${order.orderNumber}`,
    applyBalance: true,
  });

  return { transaction, referral: updatedReferral, agent, amount };
}

async function listCommissionHistory(userId, query = {}) {
  const { take, skip, page } = paginationArgs(query);

  const where = { userId, type: "COMMISSION" };
  if (query.status) where.status = query.status;
  const createdAt = dateRangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({ where, take, skip, orderBy: { createdAt: "desc" } }),
    prisma.transaction.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

module.exports = { COMMISSION_RATE_PERCENT, awardCommission, listCommissionHistory };
