/**
 * Referral milestone rewards. See platform rules "Reward System" /
 * "Weekly Reward Calculation" / "Reward Duplicate Protection" /
 * "Important Milestone Interpretation".
 *
 * Milestones are counted from SUCCESSFUL referrals only (never
 * registered/pending/failed/clicks/duplicates), within a single
 * Monday–Sunday week (see utils/weekBoundary.js), against the
 * configurable tier table in config/rewardTiers.js. Each earned
 * milestone is a separate reward — reaching 20 does not replace the 10
 * or 15 rewards already earned in the same week.
 */
"use strict";

const { prisma } = require("../database/client");
const ledger = require("./ledger.service");
const { REWARD_TIERS } = require("../config/rewardTiers");
const { getWeekBoundaries } = require("../utils/weekBoundary");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function paginationArgs(query) {
  const take = Math.min(parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { take, skip: (page - 1) * take, page };
}

/**
 * Evaluate (and award, where missing) referral milestone rewards for an
 * Agent's CURRENT week, as of `referenceDate`. Idempotent: a milestone
 * already awarded for this agent/week is never awarded again — guarded
 * first by a pre-check and then by Reward's
 * `@@unique([agentId, milestone, periodStart])` constraint as the real
 * race-safe guarantee.
 *
 * Intended to be called AFTER a referral is marked SUCCESSFUL (see
 * commission.service.js / the purchase financial pipeline), once the
 * triggering transaction has already committed — each missing milestone
 * is awarded in its own short transaction here.
 *
 * Returns the list of newly-created Reward rows (empty if nothing new
 * was earned).
 */
async function evaluateReferralRewards(agentId, referenceDate = new Date()) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return [];

  const { weekStart, weekEnd } = getWeekBoundaries(referenceDate);

  const successfulCount = await prisma.referral.count({
    where: { agentId, status: "SUCCESSFUL", successfulAt: { gte: weekStart, lte: weekEnd } },
  });

  const eligibleTiers = REWARD_TIERS.filter((tier) => successfulCount >= tier.milestone);
  if (eligibleTiers.length === 0) return [];

  const alreadyAwarded = await prisma.reward.findMany({
    where: {
      agentId,
      periodStart: weekStart,
      milestone: { in: eligibleTiers.map((tier) => tier.milestone) },
    },
    select: { milestone: true },
  });
  const awardedMilestones = new Set(alreadyAwarded.map((r) => r.milestone));

  const missingTiers = eligibleTiers.filter((tier) => !awardedMilestones.has(tier.milestone));
  if (missingTiers.length === 0) return [];

  const awarded = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const tier of missingTiers) {
    // eslint-disable-next-line no-await-in-loop
    const reward = await prisma.$transaction(async (tx) => {
      let created;
      try {
        // eslint-disable-next-line no-await-in-loop
        created = await tx.reward.create({
          data: {
            userId: agent.userId,
            agentId,
            type: "REFERRAL_MILESTONE",
            milestone: tier.milestone,
            amount: tier.amount,
            currency: "GHS",
            periodStart: weekStart,
            periodEnd: weekEnd,
            status: "SUCCESSFUL",
          },
        });
      } catch (err) {
        if (err.code === "P2002") return null; // duplicate-protection race — already awarded
        throw err;
      }

      const { transaction } = await ledger.recordTransaction(tx, {
        userId: agent.userId,
        type: "REWARD",
        amount: tier.amount,
        currency: "GHS",
        status: "SUCCESSFUL",
        balanceType: "REWARD",
        referenceType: "REWARD",
        referenceId: created.id,
        description: `Referral milestone reward: ${tier.milestone} successful referrals in one week`,
        applyBalance: true,
      });

      return tx.reward.update({ where: { id: created.id }, data: { transactionId: transaction.id } });
    });

    if (reward) awarded.push(reward);
  }

  return awarded;
}

async function listRewardHistory(userId, query = {}) {
  const { take, skip, page } = paginationArgs(query);

  const where = { userId };
  if (query.status) where.status = query.status;

  const [items, total] = await Promise.all([
    prisma.reward.findMany({ where, take, skip, orderBy: { createdAt: "desc" } }),
    prisma.reward.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

module.exports = { evaluateReferralRewards, listRewardHistory };
