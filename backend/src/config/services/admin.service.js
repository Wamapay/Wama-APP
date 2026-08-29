/**
 * Admin business logic for Stage 2: viewing and suspending/activating
 * users and agents, with an audit trail. Deliberately does NOT allow
 * deleting users, or editing commission/cashback/reward/verification —
 * those belong to later backend stages.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const authService = require("./auth.service");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function paginationArgs(query) {
  const take = Math.min(parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { take, skip: (page - 1) * take, page };
}

async function logAdminActivity({ adminId, action, targetType, targetId }) {
  await prisma.adminActivity.create({
    data: { adminId, action, targetType, targetId },
  });
}

// --- Users ------------------------------------------------------------

async function listUsers(query) {
  const { take, skip, page } = paginationArgs(query);
  const where = query.status ? { status: query.status } : undefined;

  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, take, skip, orderBy: { createdAt: "desc" } }),
    prisma.user.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

async function getUserById(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound("User not found.");
  return user;
}

async function setUserStatus({ adminId, userId, status }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found.");

  const updated = await prisma.user.update({ where: { id: userId }, data: { status } });

  if (status === "SUSPENDED") {
    // Suspension revokes active sessions but never deletes any data
    // (orders, referrals, agent record, financial records, activity).
    await authService.revokeAllUserRefreshTokens(userId);
  }

  await logAdminActivity({
    adminId,
    action: status === "SUSPENDED" ? "SUSPEND_USER" : "ACTIVATE_USER",
    targetType: "User",
    targetId: userId,
  });

  return updated;
}

// --- Agents -------------------------------------------------------------

async function listAgents(query) {
  const { take, skip, page } = paginationArgs(query);
  const where = query.status ? { status: query.status } : undefined;

  const [items, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { user: true },
    }),
    prisma.agent.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

async function getAgentById(id) {
  const agent = await prisma.agent.findUnique({ where: { id }, include: { user: true } });
  if (!agent) throw ApiError.notFound("Agent not found.");
  return agent;
}

async function setAgentStatus({ adminId, agentId, status }) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found.");

  const updated = await prisma.agent.update({ where: { id: agentId }, data: { status } });

  await logAdminActivity({
    adminId,
    action: status === "SUSPENDED" ? "SUSPEND_AGENT" : "ACTIVATE_AGENT",
    targetType: "Agent",
    targetId: agentId,
  });

  return updated;
}

module.exports = {
  listUsers,
  getUserById,
  setUserStatus,
  listAgents,
  getAgentById,
  setAgentStatus,
  logAdminActivity,
};
