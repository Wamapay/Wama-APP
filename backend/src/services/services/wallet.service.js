/**
 * User-facing financial read APIs: balances, transaction history, and
 * the Agent financial summary. Purely read-only — every value here is
 * derived from User balance fields / Transaction rows that only
 * ledger.service.js (and the services built on it) ever write.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const { toDecimal, toNumber } = require("../utils/money");

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

async function getBalances(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found.");

  const cashback = toDecimal(user.cashbackBalance);
  const commission = toDecimal(user.commissionBalance);
  const reward = toDecimal(user.rewardBalance);

  return {
    cashbackBalance: toNumber(cashback),
    commissionBalance: toNumber(commission),
    rewardBalance: toNumber(reward),
    availableWithdrawalBalance: toNumber(cashback.plus(commission).plus(reward)),
  };
}

async function listTransactions(userId, query = {}) {
  const { take, skip, page } = paginationArgs(query);

  const where = { userId };
  if (query.type) where.type = query.type;
  if (query.balanceType) where.balanceType = query.balanceType;
  if (query.status) where.status = query.status;
  const createdAt = dateRangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({ where, take, skip, orderBy: { createdAt: "desc" } }),
    prisma.transaction.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

async function sumTransactions(userId, type) {
  const result = await prisma.transaction.aggregate({
    where: { userId, type, status: "SUCCESSFUL" },
    _sum: { amount: true },
  });
  return toNumber(result._sum.amount || 0);
}

async function getAgentFinancialSummary(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { agent: true } });
  if (!user) throw ApiError.notFound("User not found.");
  if (!user.agent) throw ApiError.notFound("You do not have an Agent profile yet.");

  const balances = await getBalances(userId);

  const [totalCommissionEarned, totalCashbackEarned, totalRewardsEarned] = await Promise.all([
    sumTransactions(userId, "COMMISSION"),
    sumTransactions(userId, "CASHBACK"),
    sumTransactions(userId, "REWARD"),
  ]);

  return {
    ...balances,
    totalCommissionEarned,
    totalCashbackEarned,
    totalRewardsEarned,
    successfulReferrals: user.agent.successfulReferrals,
    verificationStatus: user.agent.verificationStatus,
  };
}

module.exports = { getBalances, listTransactions, getAgentFinancialSummary };
