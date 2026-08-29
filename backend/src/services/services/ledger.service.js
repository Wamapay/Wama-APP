/**
 * The financial ledger. This is the ONLY code path in the application
 * allowed to INSERT a Transaction row or mutate a User's
 * cashbackBalance/commissionBalance/rewardBalance — every other
 * financial service (cashback, commission, reward, withdrawal) goes
 * through `recordTransaction` so the ledger stays the single source of
 * truth (see platform rule "Financial Ledger").
 *
 * Callers MUST pass a Prisma transaction client (`tx`, from
 * `prisma.$transaction(async (tx) => { ... })`) — never the global
 * `prisma` — so the Transaction row and any balance update it triggers
 * commit or roll back together with the rest of the financial operation
 * (order paid, referral marked SUCCESSFUL, agent verification, etc.).
 * See platform rule "Balance Integrity".
 *
 * Idempotency: when `referenceId` is supplied, at most one Transaction
 * of a given `type` can ever exist for it — enforced first by a
 * pre-check (fast path, avoids unnecessary balance mutation) and then
 * by the database's `@@unique([type, referenceId])` constraint as the
 * real guarantee against a race between two concurrent callers (see
 * platform rules "Cashback Duplicate Protection", "Payment Idempotency").
 * A second call for the same event is a safe no-op: it returns the
 * existing row with `created: false` and never re-applies the balance
 * change.
 */
"use strict";

const { todayStamp, formatId } = require("../utils/financeIdGenerator");
const { toDecimal } = require("../utils/money");

const MAX_ID_ATTEMPTS = 8;

const BALANCE_FIELD = Object.freeze({
  CASHBACK: "cashbackBalance",
  COMMISSION: "commissionBalance",
  REWARD: "rewardBalance",
});

function balanceFieldFor(balanceType) {
  return BALANCE_FIELD[balanceType] || null;
}

/**
 * Record one immutable ledger event, optionally applying a balance
 * delta to the owning user in the same call.
 *
 * @param {object} tx - Prisma transaction client.
 * @param {object} params
 * @param {string} params.userId - Owner of both the transaction and (if applyBalance) the balance change.
 * @param {"COURSE_PURCHASE"|"CASHBACK"|"COMMISSION"|"REWARD"|"WITHDRAWAL"|"WITHDRAWAL_REVERSAL"} params.type
 * @param {number|string|Prisma.Decimal} params.amount
 * @param {string} [params.currency="GHS"]
 * @param {"PENDING"|"SUCCESSFUL"|"FAILED"} [params.status="SUCCESSFUL"]
 * @param {"CASHBACK"|"COMMISSION"|"REWARD"|null} [params.balanceType=null]
 * @param {"ORDER"|"REWARD"|"WITHDRAWAL"|null} [params.referenceType=null]
 * @param {string|null} [params.referenceId=null] - Enables idempotency when set.
 * @param {string} [params.description=""]
 * @param {object|null} [params.metadata=null]
 * @param {boolean} [params.applyBalance=false] - Whether this call should also credit/debit the user's balance.
 * @param {number|string|Prisma.Decimal} [params.balanceDelta] - Defaults to `amount` (credit) when applyBalance is true.
 * @returns {Promise<{transaction: object, created: boolean}>}
 */
async function recordTransaction(
  tx,
  {
    userId,
    type,
    amount,
    currency = "GHS",
    status = "SUCCESSFUL",
    balanceType = null,
    referenceType = null,
    referenceId = null,
    description = "",
    metadata = null,
    applyBalance = false,
    balanceDelta,
  }
) {
  // Idempotency fast path — avoids generating a new transactionId and
  // (more importantly) avoids re-applying a balance change on a retry.
  if (referenceId) {
    const existing = await tx.transaction.findFirst({ where: { type, referenceId } });
    if (existing) {
      return { transaction: existing, created: false };
    }
  }

  const decimalAmount = toDecimal(amount);

  let lastError;
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const stamp = todayStamp();
    const countToday = await tx.transaction.count({
      where: { transactionId: { startsWith: `TXN-${stamp}-` } },
    });
    const transactionId = formatId("TXN", stamp, countToday + 1 + attempt);

    try {
      // eslint-disable-next-line no-await-in-loop
      const transaction = await tx.transaction.create({
        data: {
          transactionId,
          userId,
          type,
          amount: decimalAmount,
          currency,
          status,
          balanceType,
          referenceType,
          referenceId,
          description,
          metadata: metadata ?? undefined,
        },
      });

      if (applyBalance && status === "SUCCESSFUL") {
        const field = balanceFieldFor(balanceType);
        if (field) {
          const delta = toDecimal(balanceDelta !== undefined ? balanceDelta : decimalAmount);
          // eslint-disable-next-line no-await-in-loop
          await tx.user.update({ where: { id: userId }, data: { [field]: { increment: delta } } });
        }
      }

      return { transaction, created: true };
    } catch (err) {
      if (err.code === "P2002") {
        // Either the transactionId collided (retry with the next
        // sequence number) or the (type, referenceId) uniqueness
        // constraint fired because a concurrent call won the race —
        // in the latter case, return the row it created instead of
        // erroring, since this is exactly the idempotency guarantee
        // this function promises.
        // eslint-disable-next-line no-await-in-loop
        const target = Array.isArray(err.meta?.target) ? err.meta.target : [err.meta?.target];
        if (referenceId && target.some((t) => String(t).includes("referenceId") || String(t).includes("type_referenceId"))) {
          // eslint-disable-next-line no-await-in-loop
          const winner = await tx.transaction.findFirst({ where: { type, referenceId } });
          if (winner) return { transaction: winner, created: false };
        }
        lastError = err;
        continue; // eslint-disable-line no-continue
      }
      throw err;
    }
  }

  throw lastError || new Error("Failed to generate a unique transaction ID.");
}

module.exports = { recordTransaction, balanceFieldFor, BALANCE_FIELD };
