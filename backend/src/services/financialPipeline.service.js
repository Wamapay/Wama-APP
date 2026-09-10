/**
 * The successful-purchase financial pipeline (platform rule
 * "Successful Purchase Financial Pipeline"). This is the SINGLE function
 * order.service.js's handleSuccessfulPurchase() calls once an order is
 * PAID — everything else in this file is private wiring.
 *
 * Pipeline (all balance-affecting steps run inside one DB transaction —
 * see platform rule "Balance Integrity"):
 *   1. record the COURSE_PURCHASE ledger event
 *   2. calculate + award 20% cashback to the buyer
 *   3. resolve referral attribution; if valid (not self, not already
 *      successful): mark it SUCCESSFUL, increment the Agent's
 *      successfulReferrals, calculate + award 40% commission
 *   4. commit
 *   5. (post-commit, same pattern as agentService.createAgentForUser in
 *      order.service.js) recalculate Agent verification and evaluate
 *      referral milestone rewards for the referring Agent
 *
 * Idempotent end-to-end: every ledger write goes through
 * ledger.service.js's (type, referenceId) uniqueness guarantee, so
 * calling this twice for the same order is always a safe no-op (see
 * platform rule "Payment Idempotency"). order.service.js only calls this
 * on the FIRST transition to PAID (its early-return guard already
 * prevents re-entry for an already-PAID order), but this function does
 * not rely on that alone.
 */
"use strict";

const { prisma } = require("../database/client");
const ledger = require("./ledger.service");
const cashbackService = require("./cashback.service");
const commissionService = require("./commission.service");
const agentService = require("./agent.service");
const rewardService = require("./reward.service");

async function runPurchaseFinancialPipeline(order) {
  // Defense-in-depth idempotency guard: if the COURSE_PURCHASE event for
  // this order already exists, the pipeline has already run — do
  // nothing. (order.service.js's own PAID-status early return is the
  // primary guard; this covers a theoretical race between two callers
  // both observing the order as "just became PAID".)
  const alreadyProcessed = await prisma.transaction.findFirst({
    where: { type: "COURSE_PURCHASE", referenceId: order.id },
  });
  if (alreadyProcessed) {
    return { alreadyProcessed: true };
  }

  const result = await prisma.$transaction(async (tx) => {
    await ledger.recordTransaction(tx, {
      userId: order.userId,
      type: "COURSE_PURCHASE",
      amount: order.amount,
      currency: order.currency,
      status: "SUCCESSFUL",
      balanceType: null,
      referenceType: "ORDER",
      referenceId: order.id,
      description: `Course purchase — order ${order.orderNumber}`,
      applyBalance: false,
    });

    const cashback = await cashbackService.awardCashback(tx, order);
    const commission = await commissionService.awardCommission(tx, order);

    return { cashback, commission };
  });

  // Post-commit: only relevant when a referral was actually completed.
  if (result.commission.referral) {
    const agentId = result.commission.referral.agentId;
    await agentService.updateAgentVerification(agentId);
    await rewardService.evaluateReferralRewards(agentId);
  }

  return { alreadyProcessed: false, ...result };
}

module.exports = { runPurchaseFinancialPipeline };
