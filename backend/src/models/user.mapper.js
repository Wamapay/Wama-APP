/**
 * DTO / response-shaping helpers.
 *
 * Every place that sends a User or Agent object back to the client must
 * go through these mappers so fields like `passwordHash` can never leak,
 * even if a future change adds a new sensitive column.
 */
"use strict";

function toPublicAgent(agent) {
  if (!agent) return null;
  return {
    agentId: agent.agentId,
    referralCode: agent.referralCode,
    referralLink: agent.referralLink, // attached by agent.service.js
    status: agent.status,
    successfulReferrals: agent.successfulReferrals,
    verificationStatus: agent.verificationStatus,
    verifiedAt: agent.verifiedAt,
    createdAt: agent.createdAt,
  };
}

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    profileImage: user.profileImage,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    agent: user.agent ? toPublicAgent(user.agent) : undefined,
  };
}

module.exports = { toPublicUser, toPublicAgent };
