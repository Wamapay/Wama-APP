/**
 * Withdrawals + real Paystack Transfers (Phase 11). See platform rules
 * "Withdrawal Model" through "Withdrawal Duplicate Protection", extended
 * here with: server-side 5% fee accounting, real Paystack recipient
 * creation/reuse, real transfer initiation, and admin self-approval
 * protection.
 *
 * ACCOUNTING MODEL (unchanged deduction point, new fee bookkeeping):
 *   - `amount` (gross) is still debited from the user's balance
 *     atomically at REQUEST time, exactly as before Phase 11.
 *   - `fee` (5% of amount) and `netAmount` (amount - fee) are computed
 *     server-side and stored on the Withdrawal row. The fee is NEVER a
 *     second, separate balance deduction — it is only ever "the part of
 *     the already-debited gross that Paystack does not receive".
 *   - A WITHDRAWAL_FEE ledger transaction is recorded for auditability
 *     with applyBalance:false — it documents the fee, it does not move
 *     money a second time.
 *   - The Paystack Transfer is always for `netAmount`.
 *   - On rejection/failure, the FULL GROSS `amount` is restored — never
 *     just the net — because if the transfer never succeeded, no money
 *     ever left the platform via Paystack at all.
 *
 * Concurrency: createWithdrawal debits the requested balance with a
 * single conditional `updateMany` (`WHERE id = ? AND <balance> >= ?`).
 * Postgres serializes concurrent UPDATEs to the same row, so two
 * simultaneous requests can never both succeed against the same
 * (now-insufficient) balance. Status transitions (approve/reject/
 * complete/webhook-driven failure) use the same atomic-conditional-
 * update pattern so no two concurrent callers can ever process the same
 * withdrawal twice.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const ledger = require("./ledger.service");
const adminService = require("./admin.service");
const paystackService = require("./paystack.service");
const platformSettings = require("./platformSettings.service");
const { toDecimal, isPositive, percentOf, subtract, toSubunit } = require("../utils/money");
const { todayStamp, formatId } = require("../utils/financeIdGenerator");
const logger = require("../config/logger");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_ID_ATTEMPTS = 8;

const BALANCE_TYPES = ["CASHBACK", "COMMISSION", "REWARD"];

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

// Maps our paymentMethod enum to Paystack's own recipient `type` values
// for Ghana. https://paystack.com/docs/api/transfer-recipient/#create
function paystackRecipientType(paymentMethod) {
  return paymentMethod === "mobile_money" ? "mobile_money" : "ghipss";
}

/**
 * Resolve a Paystack transfer recipient for this withdrawal's payout
 * destination — reusing an existing one for the same user+destination
 * when available (Phase 11 spec §5), otherwise validating the submitted
 * bank/network code against Paystack's real, live bank list and creating
 * a new recipient.
 */
async function resolveTransferRecipient({ userId, paymentMethod, paymentDetails }) {
  const type = paystackRecipientType(paymentMethod);
  const bankCode = paymentDetails.bankCode;
  const accountNumber = paymentMethod === "mobile_money" ? paymentDetails.phone : paymentDetails.accountNumber;
  const accountName = paymentDetails.accountName;

  const existing = await prisma.paystackRecipient.findUnique({
    where: { userId_type_bankCode_accountNumber: { userId, type, bankCode, accountNumber } },
  });
  if (existing) return existing;

  // Never trust a client-submitted bank/network code — confirm it's a
  // real one Paystack currently recognizes for Ghana before using it.
  const banks = await paystackService.listGhanaBanks(type);
  const validCode = banks.some((b) => b.code === bankCode);
  if (!validCode) {
    throw ApiError.badRequest(
      type === "mobile_money" ? "Unrecognized Mobile Money network." : "Unrecognized bank."
    );
  }

  const recipient = await paystackService.createTransferRecipient({
    type,
    name: accountName,
    accountNumber,
    bankCode,
  });

  return prisma.paystackRecipient.create({
    data: {
      userId,
      type,
      bankCode,
      accountNumber,
      accountName,
      recipientCode: recipient.recipient_code,
    },
  });
}

/**
 * Create a withdrawal request. The authenticated user's ID is always
 * used — a userId supplied in the request body is never authoritative
 * (see routes/validators, which don't even accept one). The 5% fee and
 * net payout are calculated here, server-side, from the validated
 * `amount` — never accepted from the client.
 */
async function createWithdrawal({ userId, amount, balanceType, paymentMethod, paymentDetails }) {
  if (!(await platformSettings.isFeatureEnabled("withdrawals", userId))) {
    throw ApiError.forbidden("Withdrawals are temporarily unavailable. Please try again later.");
  }
  if (!BALANCE_TYPES.includes(balanceType)) {
    throw ApiError.badRequest("Invalid balance type. Must be one of CASHBACK, COMMISSION, REWARD.");
  }

  const decimalAmount = toDecimal(amount);
  if (!isPositive(decimalAmount)) {
    throw ApiError.badRequest("Withdrawal amount must be greater than zero.");
  }

  // Server-side fee/net calculation — see file header "ACCOUNTING MODEL".
  // Rate comes from platform settings (admin-editable), never hardcoded.
  const { withdrawalFeeRatePercent } = await platformSettings.getSettings();
  const feeRate = toDecimal(withdrawalFeeRatePercent).dividedBy(100);
  const fee = percentOf(decimalAmount, feeRate);
  const netAmount = subtract(decimalAmount, fee);

  const field = ledger.balanceFieldFor(balanceType);

  let lastError;
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await prisma.$transaction(async (tx) => {
        // Atomic, race-safe reservation of the GROSS amount — unchanged
        // from pre-Phase-11 behavior (see file header).
        const reserved = await tx.user.updateMany({
          where: { id: userId, [field]: { gte: decimalAmount } },
          data: { [field]: { decrement: decimalAmount } },
        });

        if (reserved.count === 0) {
          throw ApiError.badRequest("Insufficient balance for this withdrawal.");
        }

        const stamp = todayStamp();
        const countToday = await tx.withdrawal.count({
          where: { withdrawalId: { startsWith: `WD-${stamp}-` } },
        });
        const withdrawalId = formatId("WD", stamp, countToday + 1 + attempt);
        // Our own unique reference, sent to Paystack as the transfer's
        // idempotency key once approved (see approveWithdrawal) — never
        // a random/re-derivable value (Phase 11 spec §16).
        const reference = formatId("TRF", stamp, countToday + 1 + attempt);

        const withdrawal = await tx.withdrawal.create({
          data: {
            withdrawalId,
            userId,
            amount: decimalAmount,
            fee,
            netAmount,
            currency: "GHS",
            balanceType,
            paymentMethod,
            paymentDetails: paymentDetails ?? undefined,
            status: "PENDING",
            reference,
            requestedAt: new Date(),
          },
        });

        // The debit already happened above (balance reservation), so
        // this ledger row records the event without re-applying it.
        await ledger.recordTransaction(tx, {
          userId,
          type: "WITHDRAWAL",
          amount: decimalAmount,
          currency: "GHS",
          status: "SUCCESSFUL",
          balanceType,
          referenceType: "WITHDRAWAL",
          referenceId: withdrawal.id,
          description: `Withdrawal request ${withdrawalId}`,
          applyBalance: false,
        });

        // Fee record — informational/accounting only (see file header).
        // Never applies a second balance deduction.
        await ledger.recordTransaction(tx, {
          userId,
          type: "WITHDRAWAL_FEE",
          amount: fee,
          currency: "GHS",
          status: "SUCCESSFUL",
          balanceType,
          referenceType: "WITHDRAWAL",
          referenceId: withdrawal.id,
          description: `5% withdrawal fee for ${withdrawalId}`,
          applyBalance: false,
        });

        return withdrawal;
      });
    } catch (err) {
      if (err.code === "P2002") {
        lastError = err;
        continue; // eslint-disable-line no-continue
      }
      throw err;
    }
  }

  throw lastError || ApiError.internal("Failed to generate a unique withdrawal ID.");
}

async function getWithdrawalById(id, { userId, isAdmin = false } = {}) {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
  if (!withdrawal) {
    throw ApiError.notFound("Withdrawal not found.");
  }
  if (!isAdmin && withdrawal.userId !== userId) {
    throw ApiError.notFound("Withdrawal not found.");
  }
  return withdrawal;
}

async function listWithdrawalsForUser(userId, query = {}) {
  const { take, skip, page } = paginationArgs(query);

  const where = { userId };
  if (query.status) where.status = query.status;
  if (query.balanceType) where.balanceType = query.balanceType;
  const createdAt = dateRangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  const [items, total] = await Promise.all([
    prisma.withdrawal.findMany({ where, take, skip, orderBy: { createdAt: "desc" } }),
    prisma.withdrawal.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

async function listWithdrawalsAdmin(query = {}) {
  const { take, skip, page } = paginationArgs(query);

  const where = {};
  if (query.status) where.status = query.status;
  if (query.balanceType) where.balanceType = query.balanceType;
  if (query.userId) where.userId = query.userId;
  const createdAt = dateRangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  const [items, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { user: true },
    }),
    prisma.withdrawal.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

/**
 * Shared self-approval guard (Phase 11 spec §10) — an admin can never
 * approve, reject, or complete their OWN withdrawal. Always compares the
 * authenticated admin's real ID against the withdrawal's real owner;
 * never trusts anything from the frontend.
 */
function assertNotSelfApproval(withdrawal, adminId) {
  if (withdrawal.userId === adminId) {
    throw ApiError.forbidden("You cannot process your own withdrawal request.");
  }
}

/**
 * Shared idempotent failure/reversal path — restores the FULL GROSS
 * amount exactly once and records a WITHDRAWAL_REVERSAL ledger entry.
 * Used by BOTH the admin-reject action and webhook-driven transfer
 * failures, so there is exactly one place this accounting logic lives
 * (Phase 11 spec §9 — "duplicate failure webhooks cannot restore the
 * balance twice"). The atomic conditional `updateMany` (status IN
 * PENDING/PROCESSING) is the actual duplicate-protection mechanism: a
 * second call against an already-FAILED withdrawal matches zero rows
 * and is a safe no-op.
 */
async function reverseAndFailWithdrawal({ withdrawalId, reason, extraData = {} }) {
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) throw ApiError.notFound("Withdrawal not found.");

    const claimed = await tx.withdrawal.updateMany({
      where: { id: withdrawalId, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "FAILED", rejectionReason: reason, processedAt: new Date(), ...extraData },
    });

    if (claimed.count === 0) {
      // Already FAILED (duplicate webhook) or already COMPLETED — a
      // safe, side-effect-free no-op either way.
      return { withdrawal: await tx.withdrawal.findUnique({ where: { id: withdrawalId } }), reversed: false };
    }

    const field = ledger.balanceFieldFor(withdrawal.balanceType);
    await tx.user.update({
      where: { id: withdrawal.userId },
      data: { [field]: { increment: withdrawal.amount } }, // full GROSS — see file header
    });

    await ledger.recordTransaction(tx, {
      userId: withdrawal.userId,
      type: "WITHDRAWAL_REVERSAL",
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      status: "SUCCESSFUL",
      balanceType: withdrawal.balanceType,
      referenceType: "WITHDRAWAL",
      referenceId: withdrawal.id,
      description: `Reversal for failed withdrawal ${withdrawal.withdrawalId}: ${reason}`,
      applyBalance: false, // already applied above
    });

    return { withdrawal: await tx.withdrawal.findUnique({ where: { id: withdrawalId } }), reversed: true };
  });
}

/**
 * PENDING -> PROCESSING, with a REAL Paystack Transfer now initiated for
 * the NET payout (Phase 11 spec §6). Only an Admin/Super Admin action,
 * and never against the admin's own withdrawal (§10).
 *
 * If recipient resolution or transfer initiation fails, the withdrawal
 * is immediately failed and the gross balance restored via the same
 * shared path a webhook-reported failure uses — never left silently
 * PENDING/PROCESSING with no real transfer behind it.
 */
async function approveWithdrawal({ adminId, withdrawalId }) {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) throw ApiError.notFound("Withdrawal not found.");
  assertNotSelfApproval(withdrawal, adminId);

  // Atomic conditional claim — see file header "Concurrency".
  const claimed = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "PENDING" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) {
    throw ApiError.badRequest("Only a PENDING withdrawal can be approved.");
  }

  try {
    const recipient = await resolveTransferRecipient({
      userId: withdrawal.userId,
      paymentMethod: withdrawal.paymentMethod,
      paymentDetails: withdrawal.paymentDetails,
    });

    const transfer = await paystackService.initiateTransfer({
      amountSubunit: toSubunit(withdrawal.netAmount),
      recipientCode: recipient.recipientCode,
      reference: withdrawal.reference,
      reason: `Withdrawal ${withdrawal.withdrawalId}`,
    });

    const updated = await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        transferCode: transfer.transfer_code,
        recipientCode: recipient.recipientCode,
      },
    });

    await adminService.logAdminActivity({
      adminId,
      action: "APPROVE_WITHDRAWAL",
      targetType: "Withdrawal",
      targetId: withdrawalId,
    });

    // Paystack transfer statuses: "success" (rare, synchronous — treat
    // as an immediate completion trigger via the same verified path the
    // manual complete endpoint uses), "pending"/"otp" (awaiting Paystack
    // async processing — withdrawal correctly stays PROCESSING until the
    // webhook or a manual check confirms it).
    if (transfer.status === "success") {
      return completeWithdrawal({ adminId, withdrawalId, _verifiedTransfer: transfer });
    }

    return updated;
  } catch (err) {
    logger.warn(`Withdrawal approval failed to initiate a real transfer: withdrawalId=${withdrawalId} — ${err.message}`);
    const { withdrawal: failed } = await reverseAndFailWithdrawal({
      withdrawalId,
      reason: err.message || "Could not initiate payout.",
    });
    return failed;
  }
}

/**
 * PENDING or PROCESSING -> FAILED, with a required reason. This is the
 * admin-initiated rejection path (e.g. rejecting before any transfer was
 * ever attempted); webhook-driven transfer failures go through the same
 * reverseAndFailWithdrawal helper directly. Never allowed against the
 * admin's own withdrawal (§10).
 */
async function rejectWithdrawal({ adminId, withdrawalId, reason }) {
  if (!reason || !reason.trim()) {
    throw ApiError.badRequest("A rejection reason is required.");
  }

  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) throw ApiError.notFound("Withdrawal not found.");
  assertNotSelfApproval(withdrawal, adminId);

  const { withdrawal: updated, reversed } = await reverseAndFailWithdrawal({
    withdrawalId,
    reason: reason.trim(),
  });
  if (!reversed) {
    throw ApiError.badRequest("Only a PENDING or PROCESSING withdrawal can be rejected.");
  }

  await adminService.logAdminActivity({
    adminId,
    action: "REJECT_WITHDRAWAL",
    targetType: "Withdrawal",
    targetId: withdrawalId,
  });

  return updated;
}

/**
 * PROCESSING -> COMPLETED. Terminal — a completed withdrawal can never
 * be completed, approved, or rejected again. Never allowed against the
 * admin's own withdrawal (§10).
 *
 * Phase 11 §17: this endpoint can no longer blindly flip the status. It
 * now INDEPENDENTLY re-verifies the real transfer status with Paystack
 * (unless called internally right after a synchronous "success" transfer
 * response — see approveWithdrawal) before allowing completion, the same
 * "never trust the caller alone" pattern already used for course-payment
 * verification.
 */
async function completeWithdrawal({ adminId, withdrawalId, reference, _verifiedTransfer }) {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) throw ApiError.notFound("Withdrawal not found.");
  assertNotSelfApproval(withdrawal, adminId);

  if (withdrawal.status !== "PROCESSING") {
    throw ApiError.badRequest("Only a PROCESSING withdrawal can be completed.");
  }

  let verifiedTransfer = _verifiedTransfer;
  if (!verifiedTransfer) {
    if (!withdrawal.transferCode) {
      throw ApiError.badRequest("No Paystack transfer has been initiated for this withdrawal yet.");
    }
    verifiedTransfer = await paystackService.fetchTransfer(withdrawal.transferCode);
  }

  if (verifiedTransfer.status !== "success") {
    throw ApiError.badRequest(
      `Paystack reports this transfer as "${verifiedTransfer.status}", not successful — cannot mark completed.`
    );
  }

  const claimed = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "PROCESSING" },
    data: {
      status: "COMPLETED",
      processedAt: new Date(),
      reference: reference || withdrawal.reference,
    },
  });

  if (claimed.count === 0) {
    // Already completed by a concurrent call/webhook — safe no-op.
    return prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  }

  const updated = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });

  // adminId is null when this is triggered by the transfer.success webhook
  // (Paystack confirming the payout, not a human admin action) — see
  // handleTransferWebhookEvent above. AdminActivity.adminId is a required
  // foreign key in the schema, so it must never be logged with a null
  // adminId; system-triggered completions simply aren't logged here.
  if (adminId) {
    await adminService.logAdminActivity({
      adminId,
      action: "COMPLETE_WITHDRAWAL",
      targetType: "Withdrawal",
      targetId: withdrawalId,
    });
  }

  return updated;
}

module.exports = {
  createWithdrawal,
  getWithdrawalById,
  listWithdrawalsForUser,
  listWithdrawalsAdmin,
  approveWithdrawal,
  rejectWithdrawal,
  completeWithdrawal,
  reverseAndFailWithdrawal,
};
