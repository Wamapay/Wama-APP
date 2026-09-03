/**
 * Course review business logic.
 * Only users with valid course access may submit a review. One active
 * review per user per course — a repeat submission updates the existing
 * row instead of creating a duplicate.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const platformSettings = require("./platformSettings.service");
const courseAccessService = require("./courseAccess.service");

async function assertCourseExists(courseId) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    throw ApiError.notFound("Course not found.");
  }
  return course;
}

async function upsertReview(userId, courseId, { rating, title, comment }) {
  if (!(await platformSettings.isFeatureEnabled("reviews", userId))) {
    throw ApiError.forbidden("Reviews are temporarily disabled.");
  }
  await assertCourseExists(courseId);

  const access = await courseAccessService.hasCourseAccess(userId, courseId);
  if (!access) {
    throw ApiError.forbidden("Only users who have purchased this course may leave a review.");
  }

  const existing = await prisma.review.findUnique({ where: { userId_courseId: { userId, courseId } } });

  return prisma.review.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: { rating, title, comment },
    // A brand-new review is always visible; editing content never
    // silently overrides a prior Admin moderation decision (HIDDEN stays
    // HIDDEN until an Admin restores it).
    create: {
      userId,
      courseId,
      rating,
      title,
      comment,
      status: existing ? existing.status : "PUBLISHED",
    },
  });
}

async function listReviewsForCourse(courseId, { isAdmin = false, status, page = 1, limit = 20 } = {}) {
  await assertCourseExists(courseId);

  const take = Math.min(Number(limit) || 20, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const where = { courseId };
  if (isAdmin && status) {
    where.status = status;
  } else if (!isAdmin) {
    where.status = "PUBLISHED";
  }

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, fullName: true, profileImage: true } } },
    }),
    prisma.review.count({ where }),
  ]);

  return { items, total, page: Math.max(Number(page) || 1, 1), pageSize: take };
}

async function getReviewById(id) {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) {
    throw ApiError.notFound("Review not found.");
  }
  return review;
}

async function setReviewStatus(id, status) {
  await getReviewById(id);
  return prisma.review.update({ where: { id }, data: { status } });
}

async function deleteReview(id) {
  const review = await getReviewById(id);
  await prisma.review.delete({ where: { id } });
  return review;
}

module.exports = {
  upsertReview,
  listReviewsForCourse,
  getReviewById,
  setReviewStatus,
  deleteReview,
};
