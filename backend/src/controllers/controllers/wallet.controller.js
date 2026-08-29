"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const walletService = require("../services/wallet.service");
const cashbackService = require("../services/cashback.service");
const commissionService = require("../services/commission.service");
const rewardService = require("../services/reward.service");
const { toPublicTransaction, toPublicReward } = require("../models/finance.mapper");

const getMyBalances = asyncHandler(async (req, res) => {
  const balances = await walletService.getBalances(req.user.id);
  return ApiResponse.success(res, { message: "Balances retrieved", data: { balances } });
});

const listMyTransactions = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await walletService.listTransactions(req.user.id, req.query);
  return ApiResponse.success(res, {
    message: "Transactions retrieved",
    data: { transactions: items.map(toPublicTransaction), total, page, pageSize },
  });
});

const listMyCashback = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await cashbackService.listCashbackHistory(req.user.id, req.query);
  return ApiResponse.success(res, {
    message: "Cashback history retrieved",
    data: { cashback: items.map(toPublicTransaction), total, page, pageSize },
  });
});

const listMyCommissions = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await commissionService.listCommissionHistory(req.user.id, req.query);
  return ApiResponse.success(res, {
    message: "Commission history retrieved",
    data: { commissions: items.map(toPublicTransaction), total, page, pageSize },
  });
});

const listMyRewards = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await rewardService.listRewardHistory(req.user.id, req.query);
  return ApiResponse.success(res, {
    message: "Reward history retrieved",
    data: { rewards: items.map(toPublicReward), total, page, pageSize },
  });
});

module.exports = { getMyBalances, listMyTransactions, listMyCashback, listMyCommissions, listMyRewards };
