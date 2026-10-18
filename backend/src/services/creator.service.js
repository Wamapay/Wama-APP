/**
 * Creator Store: creator accounts publish their own courses/digital
 * products. Rules (all enforced here, never in the frontend):
 *   - only CREATOR accounts can use these functions;
 *   - a creator can only ever touch courses where Course.creatorId is
 *     their own user id;
 *   - creator products are created as private DRAFTs and only go live (PUBLISHED) when an admin approves them;
 *   - on a sale the creator earns (100 - creatorFeePercent)% of the
 *     price into earningsBalance, through the ledger.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const courseService = require("./course.service");
const moduleService = require("./module.service");
const lessonService = require("./lesson.service");
const ledger = require("./ledger.service");
const platformSettings = require("./platformSettings.service");
const { percentOf, subtract, toDecimal, toNumber } = require("../utils/money");

const EDITABLE_FIELDS = ["title", "description", "shortDescription", "thumbnail", "coverImage", "price", "categoryId", "slug", "topics"];

async function getOwnedCourse(creatorId, courseId) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  // Same 404 whether it doesn't exist or belongs to someone else, so
  // course ids can't be probed.
  if (!course || course.creatorId !== creatorId) {
    throw ApiError.notFound("Product not found.");
  }
  return course;
}

async function getOwnedModule(creatorId, moduleId) {
  const mod = await moduleService.getModuleById(moduleId);
  await getOwnedCourse(creatorId, mod.courseId);
  return mod;
}

async function getOwnedLesson(creatorId, lessonId) {
  const lesson = await lessonService.getLessonById(lessonId);
  await getOwnedCourse(creatorId, lesson.module.courseId);
  return lesson;
}

async function listMyCourses(creatorId) {
  return prisma.course.findMany({
    where: { creatorId },
    orderBy: { createdAt: "desc" },
    include: {
      category: true,
      _count: { select: { modules: true, enrollments: true } },
    },
  });
}

async function getMyCourse(creatorId, courseId) {
  await getOwnedCourse(creatorId, courseId);
  return prisma.course.findUnique({
    where: { id: courseId },
    include: {
      category: true,
      modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" } } } },
    },
  });
}

async function createMyCourse(creator, data) {
  const created = await courseService.createCourse({
    ...data,
    instructorId: creator.id,
    status: "DRAFT",
    featured: false,
  });
  // createCourse has no creator concept; stamp ownership here. A new
  // product is a private DRAFT until the creator submits it for review.
  return prisma.course.update({
    where: { id: created.id },
    data: { creatorId: creator.id, approvalStatus: "DRAFT", rejectionReason: null },
  });
}

async function updateMyCourse(creatorId, courseId, updates) {
  await getOwnedCourse(creatorId, courseId);
  const safe = {};
  for (const key of EDITABLE_FIELDS) {
    if (updates[key] !== undefined) safe[key] = updates[key];
  }
  // status / featured / approvalStatus / creatorId can never be set here.
  return courseService.updateCourse(courseId, safe);
}

/**
 * Creator asks for review. DRAFT stays DRAFT until an admin approves;
 * approvalStatus PENDING means "waiting for / ready for review".
 */
async function submitForReview(creatorId, courseId) {
  const course = await getOwnedCourse(creatorId, courseId);
  if (course.status === "PUBLISHED") {
    throw ApiError.badRequest("This product is already live.");
  }
  const lessonCount = await prisma.lesson.count({ where: { module: { courseId } } });
  if (lessonCount === 0) {
    throw ApiError.badRequest("Add at least one module with a lesson before submitting for review.");
  }
  if (!course.description || !course.thumbnail) {
    throw ApiError.badRequest("Add a description and a cover image before submitting for review.");
  }
  return prisma.course.update({
    where: { id: courseId },
    data: { approvalStatus: "PENDING", rejectionReason: null },
  });
}

async function unpublishMine(creatorId, courseId) {
  await getOwnedCourse(creatorId, courseId);
  return prisma.course.update({ where: { id: courseId }, data: { status: "UNPUBLISHED" } });
}

/** Re-publish after the creator unpublished — only if already approved. */
async function republishMine(creatorId, courseId) {
  const course = await getOwnedCourse(creatorId, courseId);
  if (course.approvalStatus !== "APPROVED") {
    throw ApiError.forbidden("This product must be approved by an admin before it can go live.");
  }
  return prisma.course.update({ where: { id: courseId }, data: { status: "PUBLISHED" } });
}

// --- Admin moderation -------------------------------------------------------

async function listForReview({ approvalStatus = "PENDING" } = {}) {
  return prisma.course.findMany({
    where: { creatorId: { not: null }, approvalStatus },
    orderBy: { updatedAt: "desc" },
    include: { creator: { select: { id: true, fullName: true, email: true } }, category: true, _count: { select: { modules: true } } },
  });
}

async function approveCourse(courseId) {
  const course = await courseService.getCourseById(courseId);
  if (!course.creatorId) throw ApiError.badRequest("Only creator products need approval.");
  await prisma.course.update({
    where: { id: courseId },
    data: { approvalStatus: "APPROVED", rejectionReason: null },
  });
  return courseService.setCourseStatus(courseId, "PUBLISHED");
}

async function rejectCourse(courseId, reason) {
  const course = await courseService.getCourseById(courseId);
  if (!course.creatorId) throw ApiError.badRequest("Only creator products can be rejected.");
  return prisma.course.update({
    where: { id: courseId },
    data: { approvalStatus: "REJECTED", rejectionReason: reason, status: course.status === "PUBLISHED" ? "UNPUBLISHED" : course.status },
  });
}

// --- Earnings ---------------------------------------------------------------

/** Called inside the purchase pipeline transaction. Idempotent via ledger. */
async function awardCreatorSale(tx, order, course) {
  const { creatorFeePercent } = await platformSettings.getSettings();
  const feeRate = toDecimal(creatorFeePercent).dividedBy(100);
  const fee = percentOf(order.amount, feeRate);
  const net = subtract(order.amount, fee);

  const { transaction } = await ledger.recordTransaction(tx, {
    userId: course.creatorId,
    type: "CREATOR_SALE",
    amount: net,
    currency: order.currency,
    status: "SUCCESSFUL",
    balanceType: "EARNINGS",
    referenceType: "ORDER",
    referenceId: order.id,
    description: `Sale of "${course.title}" (order ${order.orderNumber}) — ${creatorFeePercent}% platform fee`,
    metadata: { grossAmount: String(order.amount), platformFee: String(fee), feePercent: String(creatorFeePercent) },
    applyBalance: true,
  });
  return { transaction, amount: net, fee };
}

async function getEarningsSummary(creatorId) {
  const user = await prisma.user.findUnique({ where: { id: creatorId } });
  const [sales, recent, productCount] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId: creatorId, type: "CREATOR_SALE", status: "SUCCESSFUL" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.findMany({
      where: { userId: creatorId, type: "CREATOR_SALE" },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.course.count({ where: { creatorId } }),
  ]);
  return {
    earningsBalance: toNumber(user.earningsBalance || 0),
    totalEarned: toNumber(sales._sum.amount || 0),
    salesCount: sales._count || 0,
    productCount,
    recentSales: recent,
  };
}

module.exports = {
  getOwnedCourse,
  getOwnedModule,
  getOwnedLesson,
  listMyCourses,
  getMyCourse,
  createMyCourse,
  updateMyCourse,
  submitForReview,
  unpublishMine,
  republishMine,
  listForReview,
  approveCourse,
  rejectCourse,
  awardCreatorSale,
  getEarningsSummary,
};
