/**
 * Course/lesson progress tracking. No quizzes, no assessments — completion
 * is a simple per-lesson boolean rolled up into a course-level percentage.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const courseAccessService = require("./courseAccess.service");
const lessonService = require("./lesson.service");
const enrollmentService = require("./enrollment.service");

async function countLessonsForCourse(courseId) {
  return prisma.lesson.count({ where: { module: { courseId } } });
}

/**
 * Mark a lesson complete for the current user. Enforces:
 *  - the lesson actually belongs to the given course
 *  - the user has valid course access (never lets a user mark progress
 *    on a course — or another user's progress on any course).
 */
async function markLessonComplete(userId, courseId, lessonId) {
  const access = await courseAccessService.hasCourseAccess(userId, courseId);
  if (!access) {
    throw ApiError.forbidden("You do not have access to this course.");
  }

  await lessonService.getLessonForCourse(courseId, lessonId);

  const now = new Date();

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: { completed: true, completedAt: now, lastViewedAt: now },
    create: { userId, courseId, lessonId, completed: true, completedAt: now, lastViewedAt: now },
  });

  await enrollmentService.touchLastAccessed(userId, courseId);

  const summary = await getCourseProgress(userId, courseId);

  if (summary.totalLessons > 0 && summary.completedLessons >= summary.totalLessons) {
    await prisma.enrollment.updateMany({
      where: { userId, courseId, status: { not: "COMPLETED" } },
      data: { status: "COMPLETED", completedAt: now },
    });
  }

  return summary;
}

/**
 * Course-level progress summary. Requires the user to actually have an
 * enrollment record (Admins previewing a course don't have "progress").
 */
async function getCourseProgress(userId, courseId) {
  const enrollment = await enrollmentService.getEnrollment(userId, courseId);
  if (!enrollment) {
    throw ApiError.forbidden("You do not have access to this course.");
  }

  const [totalLessons, completedLessons, lastViewed] = await Promise.all([
    countLessonsForCourse(courseId),
    prisma.lessonProgress.count({ where: { userId, courseId, completed: true } }),
    prisma.lessonProgress.findFirst({
      where: { userId, courseId },
      orderBy: { lastViewedAt: "desc" },
      include: { lesson: { select: { id: true, title: true } } },
    }),
  ]);

  const percentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // Re-fetch enrollment in case markLessonComplete just updated it.
  const freshEnrollment = await enrollmentService.getEnrollment(userId, courseId);

  return {
    courseId,
    totalLessons,
    completedLessons,
    progressPercentage: percentage,
    lastAccessedLesson: lastViewed ? lastViewed.lesson : null,
    enrollmentStatus: freshEnrollment.status,
    completedAt: freshEnrollment.completedAt,
  };
}

module.exports = { markLessonComplete, getCourseProgress };
