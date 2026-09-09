"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const adminFinanceService = require("../services/adminFinance.service");
const { toAdminTransaction } = require("../models/finance.mapper");

const adminListTransactions = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await adminFinanceService.listTransactionsAdmin(req.query);
  return ApiResponse.success(res, {
    message: "Transactions retrieved",
    data: { transactions: items.map(toAdminTransaction), total, page, pageSize },
  });
});

const getFinancialSummaryReport = asyncHandler(async (req, res) => {
  const summary = await adminFinanceService.getFinancialSummaryReport(req.query);
  return ApiResponse.success(res, { message: "Financial summary retrieved", data: { summary } });
});

const reconcileUserBalances = asyncHandler(async (req, res) => {
  const result = await adminFinanceService.reconcileUserBalances(req.params.id);
  return ApiResponse.success(res, { message: "Reconciliation complete", data: { reconciliation: result } });
});

module.exports = { adminListTransactions, getFinancialSummaryReport, reconcileUserBalances };
