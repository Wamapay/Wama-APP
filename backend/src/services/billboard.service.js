/**
 * Admin-curated "featured" entries for the dashboard activity
 * billboard — a real, admin-controlled layer on top of the automatic
 * real-purchase feed (order.service.js listRecentPurchaseActivity).
 *
 * Never fabricates a fake purchase: a featured entry is honestly its
 * own kind of thing (an admin post — a photo + message), shown with a
 * real, bounded expiry (`displayUntil`), never disguised as a genuine
 * transaction.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const orderService = require("./order.service");

const MAX_MESSAGE_LENGTH = 300;
const MAX_DURATION_DAYS = 90;

async function createFeaturedEntry({ adminId, name, imageUrl, message, durationDays }) {
  if (!name || !name.trim()) {
    throw ApiError.badRequest("name is required.");
  }
  if (!message || !message.trim()) {
    throw ApiError.badRequest("message is required.");
  }
  if (message.trim().length > MAX_MESSAGE_LENGTH) {
    throw ApiError.badRequest(`message is too long (max ${MAX_MESSAGE_LENGTH} characters).`);
  }
  const days = Number(durationDays);
  if (!Number.isFinite(days) || days <= 0) {
    throw ApiError.badRequest("durationDays must be a positive number.");
  }
  if (days > MAX_DURATION_DAYS) {
    throw ApiError.badRequest(`durationDays cannot exceed ${MAX_DURATION_DAYS}.`);
  }

  return prisma.featuredBillboardEntry.create({
    data: {
      name: name.trim(),
      imageUrl: imageUrl || null,
      message: message.trim(),
      displayUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      createdByAdminId: adminId,
    },
  });
}

/**
 * Admin management view — EVERYTHING, including already-expired
 * entries, most recent first, so an admin can see what's currently
 * live vs. what already stopped showing.
 */
async function listAllFeaturedEntries() {
  return prisma.featuredBillboardEntry.findMany({ orderBy: { createdAt: "desc" } });
}

async function deleteFeaturedEntry(id) {
  const entry = await prisma.featuredBillboardEntry.findUnique({ where: { id } });
  if (!entry) {
    throw ApiError.notFound("Featured entry not found.");
  }
  await prisma.featuredBillboardEntry.delete({ where: { id } });
  return { deleted: true };
}

/**
 * The real, public (any signed-in user) billboard feed — real featured
 * entries (not yet expired) FIRST, then real automatic purchase
 * activity. Each entry is tagged with `type` so the frontend can render
 * the right shape for each ("featured" has a custom photo/message;
 * "purchase" has a course/cashback amount).
 */
async function listBillboardActivity(limit = 10) {
  const [featured, purchases] = await Promise.all([
    prisma.featuredBillboardEntry.findMany({
      where: { displayUntil: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    orderService.listRecentPurchaseActivity(limit),
  ]);

  const featuredEntries = featured.map((f) => ({
    type: "featured",
    name: f.name,
    imageUrl: f.imageUrl,
    message: f.message,
    postedAt: f.createdAt,
  }));

  const purchaseEntries = purchases.map((p) => ({
    type: "purchase",
    buyerName: p.buyerName,
    courseTitle: p.courseTitle,
    cashbackAmount: p.cashbackAmount,
    purchasedAt: p.purchasedAt,
  }));

  return [...featuredEntries, ...purchaseEntries];
}

module.exports = {
  createFeaturedEntry,
  listAllFeaturedEntries,
  deleteFeaturedEntry,
  listBillboardActivity,
  MAX_MESSAGE_LENGTH,
  MAX_DURATION_DAYS,
};
