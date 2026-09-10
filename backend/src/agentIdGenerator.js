/**
 * Agent ID / referral code generation.
 *
 * Format:
 *   agentId       -> "AGT-10001"
 *   referralCode  -> "AGT10001"  (derived from agentId, dash removed)
 *
 * Deriving the referral code from the agentId guarantees the two stay
 * in lock-step and only requires enforcing uniqueness on one value.
 * Uniqueness is ultimately guaranteed by the database's @unique
 * constraints on Agent.agentId / Agent.referralCode — this module just
 * picks a candidate and the caller retries on collision.
 */
"use strict";

const AGENT_ID_START = 10001;

function formatAgentId(sequence) {
  return `AGT-${sequence}`;
}

function deriveReferralCode(agentId) {
  return agentId.replace(/-/g, "");
}

function buildReferralLink(frontendUrl, referralCode) {
  const base = (frontendUrl || "").replace(/\/+$/, "");
  return `${base}/register?ref=${referralCode}`;
}

module.exports = {
  AGENT_ID_START,
  formatAgentId,
  deriveReferralCode,
  buildReferralLink,
};
