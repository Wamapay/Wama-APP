"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const agentService = require("../services/agent.service");
const userService = require("../services/user.service");
const walletService = require("../services/wallet.service");
const { toPublicAgent } = require("../models/user.mapper");

const getMe = asyncHandler(async (req, res) => {
  const agent = await agentService.getAgentByUserId(req.user.id);
  if (!agent) {
    throw ApiError.notFound("You do not have an Agent profile yet.");
  }

  const user = await userService.getUserWithAgent(req.user.id);
  const financialSummary = await walletService.getAgentFinancialSummary(req.user.id);

  return ApiResponse.success(res, {
    message: "Agent profile",
    data: {
      agent: {
        ...toPublicAgent(agent),
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
        },
        commissionSummary: {
          totalCommission: financialSummary.totalCommissionEarned,
          availableBalance: financialSummary.commissionBalance,
        },
        referralStatistics: {
          successfulReferrals: agent.successfulReferrals,
          registeredReferrals: null,
        },
      },
    },
  });
});

/** @route GET /api/v1/agents/me/financial-summary (Backend Stage 4) */
const getMyFinancialSummary = asyncHandler(async (req, res) => {
  const summary = await walletService.getAgentFinancialSummary(req.user.id);
  return ApiResponse.success(res, { message: "Financial summary retrieved", data: { summary } });
});

module.exports = { getMe, getMyFinancialSummary };
