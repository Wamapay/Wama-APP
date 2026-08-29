/**
 * Agent business logic.
 *
 * Agents are never created directly by a user-facing "create agent" API —
 * per the platform rule, a qualifying successful course purchase causes
 * an Agent account to be created. `createAgentForUser` is the reusable
 * service the (future) purchase system will call. It is idempotent: a
 * user can never end up with more than one Agent profile.
 */
"use strict";

const { prisma } = require("../database/client");
const { config } = require("../config/env");
const ApiError = require("../utils/ApiError");
const {
  AGENT_ID_START,
  formatAgentId,
  deriveReferralCode,
  buildReferralLink,
} = require("../utils/agentIdGenerator");

const VERIFICATION_THRESHOLD = 20;
const MAX_ID_GENERATION_ATTEMPTS = 8;

function withReferralLink(agent) {
  if (!agent) return null;
  return {
    ...agent,
    referralLink: buildReferralLink(config.frontendUrl, agent.referralCode),
  };
}

/**
 * Idempotently create an Agent profile for a user.
 * If the user already has one, the existing Agent is returned unchanged —
 * this is what guarantees "one user = one Agent" even under concurrent
 * calls (the DB's unique constraint on Agent.userId is the real guarantee;
 * this pre-check just avoids unnecessary churn/log noise in the common case).
 */
async function createAgentForUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { agent: true } });
  if (!user) {
    throw ApiError.notFound("User not found.");
  }

  if (user.agent) {
    return withReferralLink(user.agent);
  }

  // Sequence number for the human-facing Agent ID. Uses the current Agent
  // count as a starting point and retries forward on collision, which
  // covers races between concurrent qualifying purchases.
  const existingCount = await prisma.agent.count();
  let attempt = 0;
  let lastError;

  while (attempt < MAX_ID_GENERATION_ATTEMPTS) {
    const sequence = AGENT_ID_START + existingCount + attempt;
    const agentId = formatAgentId(sequence);
    const referralCode = deriveReferralCode(agentId);

    try {
      const agent = await prisma.agent.create({
        data: {
          userId,
          agentId,
          referralCode,
        },
      });

      // Promote the user's role to AGENT now that they have an Agent profile.
      // Admins/Super Admins keep their higher role.
      if (user.role === "USER") {
        await prisma.user.update({ where: { id: userId }, data: { role: "AGENT" } });
      }

      return withReferralLink(agent);
    } catch (err) {
      // Unique constraint violation on agentId/referralCode/userId — retry
      // with the next sequence number, unless it was the userId constraint
      // (meaning a concurrent request already created the Agent).
      if (err.code === "P2002") {
        const target = Array.isArray(err.meta?.target) ? err.meta.target : [err.meta?.target];
        if (target.some((t) => String(t).includes("userId"))) {
          const existing = await prisma.agent.findUnique({ where: { userId } });
          if (existing) return withReferralLink(existing);
        }
        lastError = err;
        attempt += 1;
        continue;
      }
      throw err;
    }
  }

  throw lastError || ApiError.internal("Failed to generate a unique Agent ID.");
}

async function getAgentByUserId(userId) {
  const agent = await prisma.agent.findUnique({ where: { userId } });
  return withReferralLink(agent);
}

async function getAgentById(agentId) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { user: true },
  });
  return withReferralLink(agent);
}

/**
 * Recalculate an Agent's verification status from their successful
 * referral count. This is the ONLY code path allowed to set
 * verificationStatus/verifiedAt — never exposed for direct client control.
 */
async function updateAgentVerification(agentId) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    throw ApiError.notFound("Agent not found.");
  }

  const shouldBeVerified = agent.successfulReferrals >= VERIFICATION_THRESHOLD;
  const isCurrentlyVerified = agent.verificationStatus === "VERIFIED";

  if (shouldBeVerified === isCurrentlyVerified) {
    return withReferralLink(agent);
  }

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: shouldBeVerified
      ? { verificationStatus: "VERIFIED", verifiedAt: new Date() }
      : { verificationStatus: "NOT_VERIFIED", verifiedAt: null },
  });

  return withReferralLink(updated);
}

async function setAgentStatus(agentId, status) {
  const agent = await prisma.agent.update({ where: { id: agentId }, data: { status } });
  return withReferralLink(agent);
}

/**
 * Dev/test-only helper: directly set an Agent's successfulReferrals count
 * and recalculate verification. NEVER exposed through a normal user/agent
 * API — only wired up behind the dev-only routes (config.enableDevRoutes),
 * which are themselves disabled outside development. In production this
 * count will only ever move via the purchase/referral system (later stage).
 */
async function setSuccessfulReferralsForTesting(agentId, count) {
  await prisma.agent.update({ where: { id: agentId }, data: { successfulReferrals: count } });
  return updateAgentVerification(agentId);
}

module.exports = {
  VERIFICATION_THRESHOLD,
  createAgentForUser,
  getAgentByUserId,
  getAgentById,
  updateAgentVerification,
  setAgentStatus,
  setSuccessfulReferralsForTesting,
};
