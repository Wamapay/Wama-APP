"use strict";

const { z } = require("zod");

// Real Ghanaian MSISDN format: local "0XXXXXXXXX" (10 digits) or
// international "+233XXXXXXXXX"/"233XXXXXXXXX" (9 digits after the
// country code). This validates genuine national numbering-plan shape,
// not a Paystack-specific rule — Paystack's own recipient-creation call
// remains the final authority on whether a given number is actually a
// working Mobile Money account.
const GHANA_PHONE_REGEX = /^(0\d{9}|(?:\+?233)\d{9})$/;

// paymentDetails is now validated per balanceType/paymentMethod rather
// than accepted as an arbitrary object (Phase 11 spec §4 — the previous
// z.record(z.string(), z.any()) was too permissive). `type` distinguishes
// which shape applies and is required so the backend never has to guess.
const mobileMoneyDetailsSchema = z.object({
  type: z.literal("mobile_money"),
  // Paystack's own bank_code for the Mobile Money network (e.g. MTN,
  // Telecel, AirtelTigo) — validated server-side against the real,
  // live GET /bank?type=mobile_money&currency=GHS list, never a
  // hardcoded guess (see withdrawal.service.js#resolveTransferRecipient).
  bankCode: z.string().trim().min(1, "Mobile Money network is required"),
  phone: z.string().trim().regex(GHANA_PHONE_REGEX, "Enter a valid Ghanaian mobile number"),
  accountName: z.string().trim().min(2, "Account holder name is required").max(120),
});

const bankDetailsSchema = z.object({
  type: z.literal("bank"),
  // Paystack's own bank_code for the bank — validated server-side
  // against the real, live GET /bank?type=ghipss&currency=GHS list.
  bankCode: z.string().trim().min(1, "Bank is required"),
  accountNumber: z.string().trim().min(4, "Account number is required").max(50),
  accountName: z.string().trim().min(2, "Account holder name is required").max(120),
});

const withdrawalPaymentDetailsSchema = z.discriminatedUnion("type", [
  mobileMoneyDetailsSchema,
  bankDetailsSchema,
]);

// The client may ONLY provide amount/balanceType/paymentMethod/paymentDetails.
// userId is NEVER accepted here — the authenticated user is always used
// (see withdrawal.controller.js). There is deliberately no min/max on
// `amount` beyond "greater than zero" — see platform rules
// "No Minimum Withdrawal" / "No Maximum Withdrawal". The 5% fee is
// calculated entirely server-side (see withdrawal.service.js) — the
// client never sends or influences it.
const createWithdrawalSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive("amount must be greater than zero"),
    balanceType: z.enum(["CASHBACK", "COMMISSION", "REWARD"]),
    paymentMethod: z.enum(["mobile_money", "bank"]),
    paymentDetails: withdrawalPaymentDetailsSchema,
  }),
});

const withdrawalIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const withdrawalListQuerySchema = z.object({
  query: z.object({
    status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
    balanceType: z.enum(["CASHBACK", "COMMISSION", "REWARD"]).optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const adminWithdrawalListQuerySchema = z.object({
  query: z.object({
    status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
    balanceType: z.enum(["CASHBACK", "COMMISSION", "REWARD"]).optional(),
    userId: z.string().trim().min(1).optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const rejectWithdrawalSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    reason: z.string().trim().min(3, "reason is required").max(500),
  }),
});

const completeWithdrawalSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    reference: z.string().trim().max(200).optional(),
  }),
});

// Shared by GET /users/me/transactions, /cashback, /commissions, /rewards.
const transactionListQuerySchema = z.object({
  query: z.object({
    type: z
      .enum(["COURSE_PURCHASE", "CASHBACK", "COMMISSION", "REWARD", "WITHDRAWAL", "WITHDRAWAL_REVERSAL", "WITHDRAWAL_FEE"])
      .optional(),
    balanceType: z.enum(["CASHBACK", "COMMISSION", "REWARD"]).optional(),
    status: z.enum(["PENDING", "SUCCESSFUL", "FAILED"]).optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const rewardListQuerySchema = z.object({
  query: z.object({
    status: z.enum(["SUCCESSFUL", "REVERSED"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const adminTransactionListQuerySchema = z.object({
  query: z.object({
    search: z.string().trim().max(200).optional(),
    userId: z.string().trim().min(1).optional(),
    type: z
      .enum(["COURSE_PURCHASE", "CASHBACK", "COMMISSION", "REWARD", "WITHDRAWAL", "WITHDRAWAL_REVERSAL", "WITHDRAWAL_FEE"])
      .optional(),
    balanceType: z.enum(["CASHBACK", "COMMISSION", "REWARD"]).optional(),
    status: z.enum(["PENDING", "SUCCESSFUL", "FAILED"]).optional(),
    referenceId: z.string().trim().min(1).optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const adminReportQuerySchema = z.object({
  query: z.object({
    period: z
      .enum(["today", "yesterday", "last_7_days", "last_30_days", "this_month", "last_month", "custom"])
      .optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
  }),
});

module.exports = {
  createWithdrawalSchema,
  withdrawalIdParamSchema,
  withdrawalListQuerySchema,
  adminWithdrawalListQuerySchema,
  rejectWithdrawalSchema,
  completeWithdrawalSchema,
  transactionListQuerySchema,
  rewardListQuerySchema,
  adminTransactionListQuerySchema,
  adminReportQuerySchema,
};
