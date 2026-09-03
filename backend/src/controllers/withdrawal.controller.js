"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const withdrawalService = require("../services/withdrawal.service");
const paystackService = require("../services/paystack.service");
const { toPublicWithdrawal, toAdminWithdrawal } = require("../models/finance.mapper");

// GET /withdrawals/banks?type=mobile_money|bank — real, live Paystack
// bank/network codes (see paystack.service.js#listGhanaBanks). "bank" in
// the query maps to Paystack's own "ghipss" type for Ghana bank accounts.
const listBanks = asyncHandler(async (req, res) => {
  const type = req.query.type === "mobile_money" ? "mobile_money" : req.query.type === "bank" ? "ghipss" : null;
  if (!type) {
    throw ApiError.badRequest('type must be "mobile_money" or "bank".');
  }
  const banks = await paystackService.listGhanaBanks(type);
  return ApiResponse.success(res, {
    message: "Banks retrieved",
    data: { banks: banks.map((b) => ({ name: b.name, code: b.code })) },
  });
});

const createWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.createWithdrawal({
    userId: req.user.id,
    amount: req.body.amount,
    balanceType: req.body.balanceType,
    paymentMethod: req.body.paymentMethod,
    paymentDetails: req.body.paymentDetails,
  });
  return ApiResponse.success(res, {
    statusCode: 201,
    message: "Withdrawal request created",
    data: { withdrawal: toPublicWithdrawal(withdrawal) },
  });
});

const listMyWithdrawals = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await withdrawalService.listWithdrawalsForUser(req.user.id, req.query);
  return ApiResponse.success(res, {
    message: "Withdrawals retrieved",
    data: { withdrawals: items.map(toPublicWithdrawal), total, page, pageSize },
  });
});

const getMyWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.getWithdrawalById(req.params.id, {
    userId: req.user.id,
    isAdmin: false,
  });
  return ApiResponse.success(res, {
    message: "Withdrawal retrieved",
    data: { withdrawal: toPublicWithdrawal(withdrawal) },
  });
});

// --- Admin ------------------------------------------------------------

const adminListWithdrawals = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await withdrawalService.listWithdrawalsAdmin(req.query);
  return ApiResponse.success(res, {
    message: "Withdrawals retrieved",
    data: { withdrawals: items.map(toAdminWithdrawal), total, page, pageSize },
  });
});

const adminGetWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.getWithdrawalById(req.params.id, { isAdmin: true });
  return ApiResponse.success(res, {
    message: "Withdrawal retrieved",
    data: { withdrawal: toAdminWithdrawal(withdrawal) },
  });
});

const adminApproveWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.approveWithdrawal({
    adminId: req.user.id,
    withdrawalId: req.params.id,
  });
  return ApiResponse.success(res, {
    message: "Withdrawal approved — now processing",
    data: { withdrawal: toAdminWithdrawal(withdrawal) },
  });
});

const adminRejectWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.rejectWithdrawal({
    adminId: req.user.id,
    withdrawalId: req.params.id,
    reason: req.body.reason,
  });
  return ApiResponse.success(res, {
    message: "Withdrawal rejected — reserved balance restored",
    data: { withdrawal: toAdminWithdrawal(withdrawal) },
  });
});

const adminCompleteWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.completeWithdrawal({
    adminId: req.user.id,
    withdrawalId: req.params.id,
    reference: req.body.reference,
  });
  return ApiResponse.success(res, {
    message: "Withdrawal completed",
    data: { withdrawal: toAdminWithdrawal(withdrawal) },
  });
});

module.exports = {
  createWithdrawal,
  listMyWithdrawals,
  getMyWithdrawal,
  listBanks,
  adminListWithdrawals,
  adminGetWithdrawal,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  adminCompleteWithdrawal,
};
