/**
 * Notifications.
 *
 * Admin-initiated only for now (see sendFromAdmin) — there is no
 * system-generated notification anywhere yet (order confirmations, etc.
 * are handled by other channels already, e.g. email). sentByAdminId is
 * always set on every row this module creates, so a future
 * system-generated notification type can be added later without
 * ambiguity about which rows came from an admin action.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function paginationArgs(query) {
  const take = Math.min(parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { take, skip: (page - 1) * take, page };
}

/**
 * audience: "USER" (requires userId), "AGENTS" (every user with an Agent
 * record), or "ALL" (every user). Uses createMany for the broadcast
 * cases — one real Notification row per recipient, not a single shared
 * row, so each recipient's read/unread state is independent.
 */
async function sendFromAdmin({ adminId, title, message, audience, userId }) {
  if (audience === "USER") {
    if (!userId) throw ApiError.badRequest("userId is required when audience is USER.");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw ApiError.notFound("User not found.");

    await prisma.notification.create({
      data: { userId, title, message, sentByAdminId: adminId },
    });
    return { count: 1 };
  }

  let recipientIds;
  if (audience === "AGENTS") {
    const agents = await prisma.agent.findMany({ select: { userId: true } });
    recipientIds = agents.map((a) => a.userId);
  } else if (audience === "ALL") {
    const users = await prisma.user.findMany({ select: { id: true } });
    recipientIds = users.map((u) => u.id);
  } else {
    throw ApiError.badRequest("audience must be one of USER, AGENTS, ALL.");
  }

  if (recipientIds.length === 0) {
    return { count: 0 };
  }

  await prisma.notification.createMany({
    data: recipientIds.map((id) => ({ userId: id, title, message, sentByAdminId: adminId })),
  });

  return { count: recipientIds.length };
}

async function listForUser(userId, query = {}) {
  const { take, skip, page } = paginationArgs(query);
  const where = { userId };
  if (query.unreadOnly === "true") where.isRead = false;

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, take, skip, orderBy: { createdAt: "desc" } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return { items, total, page, pageSize: take, unreadCount };
}

async function markRead(userId, notificationId) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) {
    // Same "not found" either way — never reveals that a notification
    // with this id exists but belongs to someone else.
    throw ApiError.notFound("Notification not found.");
  }
  return prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
}

async function markAllRead(userId) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { count: result.count };
}

module.exports = { sendFromAdmin, listForUser, markRead, markAllRead };
