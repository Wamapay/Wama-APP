/**
 * Real referral leaderboard — ranks agents by their genuine
 * successfulReferrals count. Respects the existing profileVisibility
 * "leaderboard" opt-out (see user.service.js) — an agent who has
 * explicitly turned this off is excluded entirely, not just
 * anonymized. Privacy-safe names only (first name + last initial),
 * matching the same pattern already used for the dashboard billboard.
 */
"use strict";

const { prisma } = require("../database/client");

const MAX_LIMIT = 50;

function privacySafeName(fullName) {
  const parts = (fullName || "Someone").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

async function getLeaderboard({ limit = 20, forUserId = null } = {}) {
  const take = Math.min(parseInt(limit, 10) || 20, MAX_LIMIT);

  const agents = await prisma.agent.findMany({
    where: { status: "ACTIVE" },
    orderBy: { successfulReferrals: "desc" },
    include: { user: { select: { id: true, fullName: true, profileVisibility: true } } },
  });

  // Opted-out agents are excluded entirely, not just anonymized —
  // filtered in application code since not every database can
  // reliably query inside a JSON column the same way.
  const visible = agents.filter((a) => a.user.profileVisibility?.leaderboard !== false);

  const ranked = visible.map((a, i) => ({
    rank: i + 1,
    name: privacySafeName(a.user.fullName),
    successfulReferrals: a.successfulReferrals,
    isVerified: a.verificationStatus === "VERIFIED",
    isYou: forUserId ? a.userId === forUserId : false,
  }));

  const yourEntry = forUserId ? ranked.find((r) => r.isYou) || null : null;

  return { top: ranked.slice(0, take), yourRank: yourEntry };
}

module.exports = { getLeaderboard };
