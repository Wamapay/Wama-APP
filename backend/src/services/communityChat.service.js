/**
 * Global Community Chat — a single, platform-wide room, real
 * persistence (replaces what was previously entirely local, per-browser
 * fake demo state on the frontend).
 *
 * Delivery model: near-real-time via polling, NOT a WebSocket push.
 * The frontend calls listMessages on an interval while the chat screen
 * is open. This deliberately avoids taking on new infrastructure
 * (a persistent-connection server, and the sticky-session/pub-sub
 * complexity that comes with running more than one Railway replica) —
 * see rateLimiter.js's shared-Redis-store notes for the same
 * multi-replica consideration. A few seconds of delay is an accepted
 * tradeoff for a straightforward, low-cost real implementation.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");

const MAX_MESSAGE_LENGTH = 1000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * `after` (optional) — a message id already seen by the caller. When
 * given, returns only messages created after that one (what a polling
 * frontend actually wants: "what's new since my last fetch"), oldest
 * first. Without it, returns the most recent page, newest first — the
 * initial load when the chat screen first opens.
 */
async function listMessages({ after, limit } = {}) {
  const take = Math.min(parseInt(limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  if (after) {
    const afterMessage = await prisma.communityMessage.findUnique({ where: { id: after } });
    if (!afterMessage) {
      // The referenced message no longer exists (e.g. an admin deleted
      // it between polls) — fall back to "everything since its
      // timestamp" rather than erroring the whole poll out.
      return prisma.communityMessage.findMany({
        where: {},
        orderBy: { createdAt: "asc" },
        take,
        include: { user: { select: { id: true, fullName: true, profileImage: true } } },
      });
    }
    return prisma.communityMessage.findMany({
      where: { createdAt: { gt: afterMessage.createdAt } },
      orderBy: { createdAt: "asc" },
      take,
      include: { user: { select: { id: true, fullName: true, profileImage: true } } },
    });
  }

  const recent = await prisma.communityMessage.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { id: true, fullName: true, profileImage: true } } },
  });
  return recent.reverse(); // oldest-first, matching normal chat reading order
}

async function sendMessage(userId, message) {
  const trimmed = (message || "").trim();
  if (!trimmed) {
    throw ApiError.badRequest("Message cannot be empty.");
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw ApiError.badRequest(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`);
  }

  return prisma.communityMessage.create({
    data: { userId, message: trimmed },
    include: { user: { select: { id: true, fullName: true, profileImage: true } } },
  });
}

/**
 * Admin moderation — real deletion, not a soft-hide. A public chat room
 * genuinely needs the ability to remove something (spam, abuse) rather
 * than just marking it hidden forever; unlike reviews/enrollments,
 * there's no legitimate reason to keep a deleted chat message around.
 */
async function deleteMessage(messageId) {
  const message = await prisma.communityMessage.findUnique({ where: { id: messageId } });
  if (!message) {
    throw ApiError.notFound("Message not found.");
  }
  await prisma.communityMessage.delete({ where: { id: messageId } });
  return { deleted: true };
}

module.exports = { listMessages, sendMessage, deleteMessage, MAX_MESSAGE_LENGTH };
