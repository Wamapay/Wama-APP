/**
 * Enrollment business logic.
 * Enrollments are only ever created by order.service.js's
 * handleSuccessfulPurchase — never directly by a user-facing API.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");

/**
 * Idempotently ensure a user is enrolled in a course, linked to the order
 * that paid for it. Must be called inside the same transaction that marks
 * the order PAID so a purchase can never be "half completed".
 */
async function ensureEnrollment(tx, { userId, courseId, orderId }) {
  const existing = await tx.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });

  if (existing) {
    // Reactivate if it was previously suspended; keep completion history.
    if (existing.status === "SUSPENDED") {
      return tx.enrollment.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", orderId: existing.orderId || orderId },
      });
    }
    return existing;
  }

  return tx.enrollment.create({
    data: {
      userId,
      courseId,
      orderId,
      status: "ACTIVE",
      enrolledAt: new Date(),
    },
  });
}

async function getEnrollment(userId, courseId) {
  return prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
}

async function requireEnrollment(userId, courseId) {
  const enrollment = await getEnrollment(userId, courseId);
  if (!enrollment) {
    throw ApiError.forbidden("You do not have access to this course.");
  }
  return enrollment;
}

async function touchLastAccessed(userId, courseId) {
  await prisma.enrollment.updateMany({
    where: { userId, courseId },
    data: { lastAccessedAt: new Date() },
  });
}

module.exports = { ensureEnrollment, getEnrollment, requireEnrollment, touchLastAccessed };
