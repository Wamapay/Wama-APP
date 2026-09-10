/**
 * Admin-only financial read APIs: transaction search, financial
 * reporting, and balance reconciliation. Read-only by design — there is
 * intentionally no endpoint anywhere that lets an Admin directly edit a
 * balance (see platform rule "Admin Security" — no `PUT /users/:id/balance`).
 */
"use strict";

const { prisma } = require("../database/client");
const { toNumber } = require("../utils/money");

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

async function listTransactionsAdmin(query = {}) {
  const { take, skip, page } = paginationArgs(query);

  const where = {};
  if (query.userId) where.userId = query.userId;
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;
  if (query.balanceType) where.balanceType = query.balanceType;
  if (query.referenceId) where.referenceId = query.referenceId;
  if (query.search) {
    where.OR = [
      { transactionId: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
      { user: { email: { contains: query.search, mode: "insensitive" } } },
    ];
  }
  const createdAt = dateRangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { user: true },
    }),
    prisma.transaction.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

/**
 * Resolve one of the platform's named reporting periods (or an explicit
 * custom range) into { from, to } Date bounds, in UTC.
 */
function resolveReportPeriod(query = {}) {
  const now = new Date();
  const startOfDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const endOfDay = (d) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

  const period = query.period || "custom";

  switch (period) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setUTCDate(now.getUTCDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last_7_days": {
      const from = new Date(now);
      from.setUTCDate(now.getUTCDate() - 6);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case "last_30_days": {
      const from = new Date(now);
      from.setUTCDate(now.getUTCDate() - 29);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case "this_month": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { from, to: endOfDay(now) };
    }
    case "last_month": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
      return { from, to };
    }
    case "custom":
    default: {
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      return {
        from: from && !Number.isNaN(from.getTime()) ? from : undefined,
        to: to && !Number.isNaN(to.getTime()) ? to : undefined,
      };
    }
  }
}

async function sumWhere(model, where, field = "amount") {
  const result = await prisma[model].aggregate({ where, _sum: { [field]: true } });
  return toNumber(result._sum[field] || 0);
}

/**
 * GET /api/v1/admin/reports/financial-summary — every figure is a
 * database calculation over the ledger/orders/withdrawals, never a
 * frontend-supplied value.
 */
async function getFinancialSummaryReport(query = {}) {
  const { from, to } = resolveReportPeriod(query);
  const createdAt = dateRangeWhere(from, to);
  const orderDateWhere = createdAt ? { createdAt } : {};
  const txnDateWhere = createdAt ? { createdAt } : {};

  const [
    totalCourseSales,
    totalCashback,
    totalCommission,
    totalRewards,
    totalWithdrawals,
    pendingWithdrawals,
    processingWithdrawals,
    completedWithdrawals,
    failedWithdrawals,
  ] = await Promise.all([
    sumWhere("order", { status: "PAID", ...orderDateWhere }),
    sumWhere("transaction", { type: "CASHBACK", status: "SUCCESSFUL", ...txnDateWhere }),
    sumWhere("transaction", { type: "COMMISSION", status: "SUCCESSFUL", ...txnDateWhere }),
    sumWhere("transaction", { type: "REWARD", status: "SUCCESSFUL", ...txnDateWhere }),
    sumWhere("withdrawal", { ...(createdAt ? { createdAt } : {}) }),
    sumWhere("withdrawal", { status: "PENDING", ...(createdAt ? { createdAt } : {}) }),
    sumWhere("withdrawal", { status: "PROCESSING", ...(createdAt ? { createdAt } : {}) }),
    sumWhere("withdrawal", { status: "COMPLETED", ...(createdAt ? { createdAt } : {}) }),
    sumWhere("withdrawal", { status: "FAILED", ...(createdAt ? { createdAt } : {}) }),
  ]);

  return {
    period: { from: from || null, to: to || null },
    totalCourseSales,
    totalCashback,
    totalCommission,
    totalRewards,
    totalWithdrawals,
    pendingWithdrawals,
    processingWithdrawals,
    completedWithdrawals,
    failedWithdrawals,
  };
}

/**
 * Reconciliation: compares a user's stored balance fields against what
 * the ledger says they should be (sum of credits minus debits per
 * balance type). Read-only diagnostic — it reports discrepancies, it
 * never silently "fixes" a balance (see platform rule
 * "Financial Reconciliation").
 */
async function reconcileUserBalances(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const balanceTypes = ["CASHBACK", "COMMISSION", "REWARD"];
  const fieldFor = { CASHBACK: "cashbackBalance", COMMISSION: "commissionBalance", REWARD: "rewardBalance" };

  const results = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const balanceType of balanceTypes) {
    // eslint-disable-next-line no-await-in-loop
    const credits = await sumWhere("transaction", {
      userId,
      balanceType,
      status: "SUCCESSFUL",
      type: { in: ["CASHBACK", "COMMISSION", "REWARD", "WITHDRAWAL_REVERSAL"] },
    });
    // eslint-disable-next-line no-await-in-loop
    const debits = await sumWhere("transaction", {
      userId,
      balanceType,
      status: "SUCCESSFUL",
      type: "WITHDRAWAL",
    });

    const ledgerBalance = Number((credits - debits).toFixed(2));
    const storedBalance = toNumber(user[fieldFor[balanceType]]);
    results[balanceType] = {
      storedBalance,
      ledgerBalance,
      discrepancy: Number((storedBalance - ledgerBalance).toFixed(2)),
      consistent: Math.abs(storedBalance - ledgerBalance) < 0.01,
    };
  }

  return { userId, balances: results };
}

module.exports = { listTransactionsAdmin, getFinancialSummaryReport, reconcileUserBalances };
