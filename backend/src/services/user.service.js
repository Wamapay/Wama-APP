"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const agentService = require("./agent.service");

async function getUserWithAgent(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw ApiError.notFound("User not found.");
  }
  const agent = await agentService.getAgentByUserId(userId);
  return { ...user, agent };
}

// Only fullName/phone/profileImage may be self-edited. role, status,
// verification, commission/cashback/reward, and Agent identifiers are
// deliberately never accepted here — they're controlled by backend
// business logic elsewhere.
async function updateProfile(userId, updates) {
  const allowed = {};
  if (updates.fullName !== undefined) allowed.fullName = updates.fullName;
  if (updates.phone !== undefined) allowed.phone = updates.phone;
  if (updates.profileImage !== undefined) allowed.profileImage = updates.profileImage;

  const user = await prisma.user.update({ where: { id: userId }, data: allowed });
  const agent = await agentService.getAgentByUserId(userId);
  return { ...user, agent };
}

module.exports = { getUserWithAgent, updateProfile };
