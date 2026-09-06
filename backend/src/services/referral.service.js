/**
 * Referral attribution and success confirmation.
 *
 * Registering with a referral code only creates an attribution record
 * (status REGISTERED). It does NOT increment the referring Agent's
 * successfulReferrals and does NOT generate commission — those only
 * happen once Backend Stage 4's purchase financial pipeline confirms a
 * qualifying purchase (see resolveReferralForOrder / markReferralSuccessful,
 * called from commission.service.js).
 */
"use strict";

const { prisma } = require("../database/client");

/**
 * Look up the Agent that owns a referral code. Returns null (rather than
 * throwing) for an unknown code — registration should still succeed, it
 * just proceeds without attribution, since a typo in an optional field
 * shouldn't block account creation.
 */
async function findAgentByReferralCode(referralCode) {
  if (!referralCode) return null;
  return prisma.agent.findUnique({ where: { referralCode } });
}

async function attributeReferral({ agentId, referredUserId, referralCode }) {
  return prisma.referral.create({
    data: {
      agentId,
      referredUserId,
      referralCode,
      status: "REGISTERED",
    },
  });
}

async function getReferralForUser(userId) {
  return prisma.referral.findUnique({ where: { referredUserId: userId }, include: { agent: true } });
}

/**
 * Resolve the Referral (if any) that a qualifying order should complete.
 *
 * Primary source of truth is the REGISTRATION-time attribution
 * (Referral.referredUserId === order.userId). If none exists but a
 * referral code was supplied at checkout (order.agentId/referralCode —
 * see order.service.js's "purchase-time attribution" comment), that
 * attribution is created now so the purchase can still be resolved.
 *
 * Returns null (never throws) when there is nothing to do — no code was
 * ever used, the referral was already marked SUCCESSFUL (idempotency),
 * or this would be a self-referral (see platform rule
 * "Self-Referral Protection": Agent.userId === order.userId).
 *
 * Must be called inside the same `tx` that will mark the referral
 * SUCCESSFUL and create the COMMISSION transaction, so attribution
 * creation + success confirmation + commission are one atomic operation.
 */
async function resolveReferralForOrder(tx, order) {
  let referral = await tx.referral.findUnique({
    where: { referredUserId: order.userId },
    include: { agent: true },
  });

  if (!referral && order.agentId) {
    try {
      referral = await tx.referral.create({
        data: {
          agentId: order.agentId,
          referredUserId: order.userId,
          referralCode: order.referralCode || "",
          status: "REGISTERED",
        },
        include: { agent: true },
      });
    } catch (err) {
      if (err.code === "P2002") {
        // Concurrent order/registration already created it — read it back.
        referral = await tx.referral.findUnique({
          where: { referredUserId: order.userId },
          include: { agent: true },
        });
      } else {
        throw err;
      }
    }
  }

  if (!referral) return null;
  if (referral.status === "SUCCESSFUL") return null; // already processed — idempotent no-op
  if (referral.agent.userId === order.userId) return null; // self-referral — never rewarded

  return referral;
}

/** The ONLY place Referral.status transitions to SUCCESSFUL. */
async function markReferralSuccessful(tx, { referralId, orderId }) {
  return tx.referral.update({
    where: { id: referralId },
    data: { status: "SUCCESSFUL", successfulAt: new Date(), orderId },
  });
}

module.exports = {
  findAgentByReferralCode,
  attributeReferral,
  getReferralForUser,
  resolveReferralForOrder,
  markReferralSuccessful,
};
