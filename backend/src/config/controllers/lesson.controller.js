"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const { prisma } = require("../database/client");
const lessonService = require("../services/lesson.service");
const moduleService = require("../services/module.service");
const courseService = require("../services/course.service");
const courseAccessService = require("../services/courseAccess.service");
const enrollmentService = require("../services/enrollment.service");
const progressService = require("../services/progress.service");

// --- Admin CRUD -------------------------------------------------------

const adminCreateLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.createLesson(req.params.moduleId, req.body);
  return ApiResponse.success(res, { statusCode: 201, message: "Lesson created", data: { lesson } });
});

const adminUpdateLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.updateLesson(req.params.id, req.body);
  return ApiResponse.success(res, { message: "Lesson updated", data: { lesson } });
});

const adminDeleteLesson = asyncHandler(async (req, res) => {
  await lessonService.deleteLesson(req.params.id);
  return ApiResponse.success(res, { message: "Lesson deleted", data: null });
});

const adminReorderLessons = asyncHandler(async (req, res) => {
  const lessons = await lessonService.reorderLessons(req.params.moduleId, req.body.order);
  return ApiResponse.success(res, { message: "Lessons reordered", data: { lessons } });
});

// --- Protected course content / access ---------------------------------

/**
 * Course content overview for enrolled users (or preview lessons for
 * everyone else): modules + lesson metadata, with `content` only present
 * on lessons the requester actually has access to.
 */
const getCourseContent = asyncHandler(async (req, res) => {
  const course = await courseService.getCourseById(req.params.courseId);
  const userId = req.user ? req.user.id : null;
  const access = await courseAccessService.hasCourseAccess(userId, course.id);

  const modules = await moduleService.listModulesForCourse(course.id);

  const shaped = modules.map((mod) => ({
    id: mod.id,
    title: mod.title,
    description: mod.description,
    position: mod.position,
    lessons: mod.lessons.map((lesson) => {
      const unlocked = access || lesson.isPreview;
      return {
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        position: lesson.position,
        duration: lesson.duration,
        isPreview: lesson.isPreview,
        locked: !unlocked,
        content: unlocked ? lesson.content : undefined,
      };
    }),
  }));

  return ApiResponse.success(res, {
    message: "Course content retrieved",
    data: { courseId: course.id, hasAccess: access, modules: shaped },
  });
});

/**
 * GET /courses/:courseId/lessons/:lessonId
 * Preview lessons are readable by anyone; everything else requires
 * authentication + valid course access, enforced here before any
 * protected content is returned.
 */
const getLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.getLessonForCourse(req.params.courseId, req.params.lessonId);

  if (lesson.isPreview) {
    return ApiResponse.success(res, {
      message: "Lesson retrieved",
      data: { lesson: shapeLesson(lesson, true) },
    });
  }

  if (!req.user) {
    throw ApiError.unauthorized("Authentication is required to view this lesson.");
  }

  const access = await courseAccessService.hasCourseAccess(req.user.id, req.params.courseId);
  if (!access) {
    throw ApiError.forbidden("You do not have access to this lesson.");
  }

  await prismaTouch(req.user.id, req.params.courseId, lesson.id);

  return ApiResponse.success(res, {
    message: "Lesson retrieved",
    data: { lesson: shapeLesson(lesson, true) },
  });
});

async function prismaTouch(userId, courseId, lessonId) {
  await Promise.all([
    enrollmentService.touchLastAccessed(userId, courseId),
    prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { lastViewedAt: new Date() },
      create: { userId, courseId, lessonId, lastViewedAt: new Date() },
    }),
  ]);
}

function shapeLesson(lesson, includeContent) {
  return {
    id: lesson.id,
    moduleId: lesson.moduleId,
    title: lesson.title,
    description: lesson.description,
    type: lesson.type,
    position: lesson.position,
    duration: lesson.duration,
    isPreview: lesson.isPreview,
    content: includeContent ? lesson.content : undefined,
  };
}

const completeLesson = asyncHandler(async (req, res) => {
  const summary = await progressService.markLessonComplete(
    req.user.id,
    req.params.courseId,
    req.params.lessonId
  );
  return ApiResponse.success(res, { message: "Lesson marked complete", data: { progress: summary } });
});

const getCourseProgress = asyncHandler(async (req, res) => {
  const summary = await progressService.getCourseProgress(req.user.id, req.params.courseId);
  return ApiResponse.success(res, { message: "Course progress retrieved", data: { progress: summary } });
});

module.exports = {
  adminCreateLesson,
  adminUpdateLesson,
  adminDeleteLesson,
  adminReorderLessons,
  getCourseContent,
  getLesson,
  completeLesson,
  getCourseProgress,
};
