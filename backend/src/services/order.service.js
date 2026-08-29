/**
 * Order / purchase business logic.
 *
 * SECURITY: the client ONLY ever supplies `courseId` (+ optional
 * `referralCode`). The order amount is always read from Course.price in
 * the database — never from the request body. See createOrder().
 *
 * Successful purchases are FINAL: there is no refund path and a PAID
 * order can never be cancelled (see docs/API_STAGE3.md). Cashback,
 * commission, and reward calculations are handled by Backend Stage 4's
 * financialPipelineService, hooked into handleSuccessfulPurchase() below
 * without this file needing to know any of the calculation details.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const referralService = require("./referral.service");
const agentService = require("./agent.service");
const enrollmentService = require("./enrollment.service");
const financialPipelineService = require("./financialPipeline.service");
const { todayStamp, formatOrderNumber } = require("../utils/orderNumberGenerator");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_ORDER_NUMBER_ATTEMPTS = 8;

function paginationArgs(query) {
  const take = Math.min(parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { take, skip: (page - 1) * take, page };
}

function dateRangeWhere(from, to) {
  if (!from && !to) return undefined;
  const range = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) range.lte = d;
  }
  return Object.keys(range).length ? range : undefined;
}

/**
 * Create a PENDING order for a course. The official price/currency are
 * always re-read from the database here — a manipulated/stale price sent
 * by any client is never used (see docs: "Purchase Price Protection").
 */
async function createOrder({ userId, courseId, referralCode }) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    throw ApiError.notFound("Course not found.");
  }
  if (course.status !== "PUBLISHED") {
    throw ApiError.badRequest("This course is not currently available for purchase.");
  }
  if (course.price === null || course.price === undefined || Number(course.price) <= 0) {
    throw ApiError.badRequest("This course does not have a valid purchasable price.");
  }

  // Referral attribution at purchase time (separate from registration-time
  // attribution) — preserved for a later stage's commission processing.
  // An unknown/invalid code never blocks the purchase itself.
  let agent = null;
  if (referralCode) {
    agent = await referralService.findAgentByReferralCode(referralCode);
    if (agent && agent.userId === userId) {
      // A user cannot self-refer their own purchase.
      agent = null;
    }
  }

  let lastError;
  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    const stamp = todayStamp();
    const countToday = await prisma.order.count({
      where: { orderNumber: { startsWith: `ORD-${stamp}-` } },
    });
    const orderNumber = formatOrderNumber(stamp, countToday + 1 + attempt);

    try {
      // eslint-disable-next-line no-await-in-loop
      return await prisma.order.create({
        data: {
          orderNumber,
          userId,
          courseId,
          amount: course.price, // server-calculated — NEVER client-provided
          currency: course.currency,
          status: "PENDING",
          paymentStatus: "PENDING",
          agentId: agent ? agent.id : null,
          referralCode: agent ? referralCode : null,
        },
      });
    } catch (err) {
      if (err.code === "P2002") {
        lastError = err;
        continue; // eslint-disable-line no-continue
      }
      throw err;
    }
  }

  throw lastError || ApiError.internal("Failed to generate a unique order number.");
}

async function getOrderById(id, { userId, isAdmin = false } = {}) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { course: true, agent: true, enrollment: true },
  });
  if (!order) {
    throw ApiError.notFound("Order not found.");
  }
  if (!isAdmin && order.userId !== userId) {
    // Same shape as "not found" — an order ID must never let a user probe
    // for the existence of someone else's order.
    throw ApiError.notFound("Order not found.");
  }
  return order;
}

async function listOrdersForUser(userId, query = {}) {
  const { take, skip, page } = paginationArgs(query);

  const where = { userId };
  if (query.status) where.status = query.status;
  if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
  if (query.courseId) where.courseId = query.courseId;
  const createdAt = dateRangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { course: true, enrollment: true },
    }),
    prisma.order.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

async function listOrdersAdmin(query = {}) {
  const { take, skip, page } = paginationArgs(query);

  const where = {};
  if (query.status) where.status = query.status;
  if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
  if (query.courseId) where.courseId = query.courseId;
  if (query.userId) where.userId = query.userId;
  if (query.agentId) where.agentId = query.agentId;
  const createdAt = dateRangeWhere(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  if (query.search) {
    where.OR = [
      { orderNumber: { contains: query.search, mode: "insensitive" } },
      { paymentReference: { contains: query.search, mode: "insensitive" } },
      { user: { email: { contains: query.search, mode: "insensitive" } } },
      { course: { title: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { course: true, user: true, agent: true },
    }),
    prisma.order.count({ where }),
  ]);

  return { items, total, page, pageSize: take };
}

/**
 * Successful-purchase processing. Only handles the course/order/enrollment
 * portions that belong to Backend Stage 3:
 *   - order -> PAID / paymentStatus -> SUCCESSFUL
 *   - Enrollment created (idempotent)
 *   - Agent account ensured for the buyer (createAgentForUser)
 *
 * Cashback, commission, reward calculations, and Referral.status ->
 * SUCCESSFUL are intentionally NOT done here — Backend Stage 4/6 will
 * extend this function (or hook after it) without needing to rewrite the
 * purchase system.
 *
 * Idempotent: calling this twice for an already-PAID order is a no-op.
 */
async function handleSuccessfulPurchase(orderId, { paymentReference } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw ApiError.notFound("Order not found.");
  }

  if (order.status === "PAID") {
    return prisma.order.findUnique({ where: { id: orderId }, include: { enrollment: true } });
  }

  if (order.status === "CANCELLED" || order.status === "FAILED") {
    throw ApiError.badRequest("This order cannot be marked as paid from its current status.");
  }

  const paidOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: "PAID",
        paymentStatus: "SUCCESSFUL",
        paidAt: new Date(),
        ...(paymentReference ? { paymentReference } : {}),
      },
    });

    await enrollmentService.ensureEnrollment(tx, {
      userId: updated.userId,
      courseId: updated.courseId,
      orderId: updated.id,
    });

    return updated;
  });

  // Agent creation is idempotent and does not need to be inside the order
  // transaction — it's a separate concern (see agent.service.js).
  await agentService.createAgentForUser(paidOrder.userId);

  // Backend Stage 4: cashback, referral success + commission, agent
  // verification, and referral milestone rewards. Only reached on the
  // FIRST transition to PAID (the early return above short-circuits any
  // later re-processing) and is itself idempotent regardless — see
  // financialPipeline.service.js.
  await financialPipelineService.runPurchaseFinancialPipeline(paidOrder);

  return prisma.order.findUnique({ where: { id: orderId }, include: { enrollment: true } });
}

/** Mark an order as failed (e.g. payment provider reported a failure). */
async function markOrderFailed(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw ApiError.notFound("Order not found.");
  }
  if (order.status === "PAID") {
    throw ApiError.badRequest("A paid order cannot be marked as failed.");
  }
  return prisma.order.update({
    where: { id: orderId },
    data: { status: "FAILED", paymentStatus: "FAILED" },
  });
}

module.exports = {
  createOrder,
  getOrderById,
  listOrdersForUser,
  listOrdersAdmin,
  handleSuccessfulPurchase,
  markOrderFailed,
};
