/**
 * Dev/test-only controller.
 *
 * Simulates events that will, in later backend stages, be triggered by
 * the real purchase/referral system:
 *   - a qualifying course purchase (-> creates the buyer's Agent account)
 *   - a referral being confirmed as SUCCESSFUL (-> increments the
 *     referring Agent's successfulReferrals and recalculates verification)
 *
 * This entire router is only mounted when config.enableDevRoutes is true,
 * which itself can never be true in production (see config/env.js).
 */
"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const agentService = require("../services/agent.service");
const orderService = require("../services/order.service");
const { toPublicAgent } = require("../models/user.mapper");
const { toPublicOrder } = require("../models/course.mapper");

const simulateQualifyingPurchase = asyncHandler(async (req, res) => {
  const agent = await agentService.createAgentForUser(req.user.id);
  return ApiResponse.success(res, {
    message: "Simulated qualifying purchase — Agent account ensured.",
    data: { agent: toPublicAgent(agent) },
  });
});

const simulateSuccessfulReferrals = asyncHandler(async (req, res) => {
  const agent = await agentService.getAgentByUserId(req.user.id);
  if (!agent) {
    return ApiResponse.error(res, {
      statusCode: 404,
      message: "You do not have an Agent profile yet — simulate a purchase first.",
    });
  }

  const count = Number.isInteger(req.body.count) ? req.body.count : 20;
  const updated = await agentService.setSuccessfulReferralsForTesting(agent.id, count);

  return ApiResponse.success(res, {
    message: `Simulated successfulReferrals = ${count}`,
    data: { agent: toPublicAgent(updated) },
  });
});

/**
 * Backend Stage 3: simulate a successful Paystack payment for an order the
 * current user owns, without integrating a real payment provider yet.
 * Drives the SAME handleSuccessfulPurchase() path that real Paystack
 * webhook verification will call in a later stage — enrollment creation,
 * Agent creation trigger, etc. all go through the identical code path.
 */
const simulateSuccessfulPayment = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.orderId, { userId: req.user.id, isAdmin: false });
  if (order.userId !== req.user.id) {
    throw ApiError.forbidden("You can only simulate payment for your own order.");
  }

  const paymentReference = `DEV-SIM-${Date.now()}`;
  const paidOrder = await orderService.handleSuccessfulPurchase(order.id, { paymentReference });

  return ApiResponse.success(res, {
    message: "Simulated successful payment — order paid, enrollment + Agent creation triggered.",
    data: { order: toPublicOrder(paidOrder) },
  });
});

module.exports = { simulateQualifyingPurchase, simulateSuccessfulReferrals, simulateSuccessfulPayment };
