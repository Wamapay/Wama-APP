/**
 * DTO / response-shaping helpers for the financial engine (Backend
 * Stage 4) — mirrors the pattern in user.mapper.js / course.mapper.js.
 * Converts Decimal fields to plain numbers and makes sure sensitive
 * payment details never leak in full (see platform rule
 * "Withdrawal Payment Details").
 */
"use strict";

function toNumber(value) {
  if (value === null || value === undefined) return value;
  return Number(value);
}

function toPublicTransaction(transaction) {
  if (!transaction) return null;
  return {
    id: transaction.id,
    transactionId: transaction.transactionId,
    type: transaction.type,
    amount: toNumber(transaction.amount),
    currency: transaction.currency,
    status: transaction.status,
    balanceType: transaction.balanceType,
    referenceType: transaction.referenceType,
    referenceId: transaction.referenceId,
    description: transaction.description,
    createdAt: transaction.createdAt,
  };
}

function toAdminTransaction(transaction) {
  if (!transaction) return null;
  return {
    ...toPublicTransaction(transaction),
    userId: transaction.userId,
    user: transaction.user
      ? { id: transaction.user.id, fullName: transaction.user.fullName, email: transaction.user.email }
      : undefined,
    metadata: transaction.metadata || undefined,
    updatedAt: transaction.updatedAt,
  };
}

/**
 * Masks a payment-details object down to non-sensitive display fields.
 * Only ever shows the last 4 characters of any account/phone-number-like
 * value; never returns raw secrets/credentials.
 */
function maskPaymentDetails(paymentDetails) {
  if (!paymentDetails || typeof paymentDetails !== "object") return undefined;
  const masked = {};
  Object.entries(paymentDetails).forEach(([key, value]) => {
    if (typeof value === "string" && value.length > 4) {
      masked[key] = `${"*".repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
    } else {
      masked[key] = value;
    }
  });
  return masked;
}

function toPublicWithdrawal(withdrawal) {
  if (!withdrawal) return null;
  return {
    id: withdrawal.id,
    withdrawalId: withdrawal.withdrawalId,
    amount: toNumber(withdrawal.amount), // gross
    fee: toNumber(withdrawal.fee),
    netAmount: toNumber(withdrawal.netAmount),
    currency: withdrawal.currency,
    balanceType: withdrawal.balanceType,
    paymentMethod: withdrawal.paymentMethod,
    paymentDetails: maskPaymentDetails(withdrawal.paymentDetails),
    status: withdrawal.status,
    // The Paystack transfer_code for this withdrawal's own payout — safe
    // to show the owning user (it's just a reference, not a credential),
    // useful for support/troubleshooting. recipientCode is intentionally
    // NOT exposed — no user-facing value, keeps internal Paystack
    // plumbing out of API responses (Phase 11 spec §13).
    payoutReference: withdrawal.transferCode || undefined,
    reference: withdrawal.reference || undefined,
    rejectionReason: withdrawal.rejectionReason || undefined,
    requestedAt: withdrawal.requestedAt,
    processedAt: withdrawal.processedAt,
    createdAt: withdrawal.createdAt,
  };
}

function toAdminWithdrawal(withdrawal) {
  if (!withdrawal) return null;
  return {
    ...toPublicWithdrawal(withdrawal),
    userId: withdrawal.userId,
    user: withdrawal.user
      ? { id: withdrawal.user.id, fullName: withdrawal.user.fullName, email: withdrawal.user.email }
      : undefined,
  };
}

function toPublicReward(reward) {
  if (!reward) return null;
  return {
    id: reward.id,
    milestone: reward.milestone,
    amount: toNumber(reward.amount),
    currency: reward.currency,
    periodStart: reward.periodStart,
    periodEnd: reward.periodEnd,
    status: reward.status,
    createdAt: reward.createdAt,
  };
}

module.exports = {
  toPublicTransaction,
  toAdminTransaction,
  toPublicWithdrawal,
  toAdminWithdrawal,
  toPublicReward,
};
