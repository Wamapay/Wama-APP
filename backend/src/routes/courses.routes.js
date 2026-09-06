"use strict";

const { Router } = require("express");
const courseController = require("../controllers/course.controller");
const lessonController = require("../controllers/lesson.controller");
const reviewController = require("../controllers/review.controller");
const authenticate = require("../middleware/authenticate");
const optionalAuthenticate = require("../middleware/optionalAuthenticate");
const validate = require("../middleware/validate");
const { courseSlugParamSchema, courseListQuerySchema } = require("../validators/course.validator");
const { courseLessonParamSchema } = require("../validators/lesson.validator");
const { upsertReviewSchema, courseReviewsParamSchema } = require("../validators/review.validator");

const router = Router();

/** @route GET /api/v1/courses @access Public (only PUBLISHED courses) */
router.get("/", optionalAuthenticate, validate(courseListQuerySchema), courseController.listCourses);

/**
 * @route GET /api/v1/courses/:courseId/content
 * @desc  Modules + lesson metadata; lesson `content` only included for
 *        preview lessons or lessons the requester has purchased access to.
 * @access Public (shape differs based on auth/access)
 */
router.get("/:courseId/content", optionalAuthenticate, lessonController.getCourseContent);

/**
 * @route GET /api/v1/courses/:courseId/lessons/:lessonId
 * @access Public for preview lessons; Private + course access otherwise
 */
router.get(
  "/:courseId/lessons/:lessonId",
  optionalAuthenticate,
  validate(courseLessonParamSchema),
  lessonController.getLesson
);

/** @route POST /api/v1/courses/:courseId/lessons/:lessonId/complete @access Private (course access) */
router.post(
  "/:courseId/lessons/:lessonId/complete",
  authenticate,
  validate(courseLessonParamSchema),
  lessonController.completeLesson
);

/** @route GET /api/v1/courses/:courseId/progress @access Private (enrolled) */
router.get("/:courseId/progress", authenticate, lessonController.getCourseProgress);

/** @route GET /api/v1/courses/:courseId/reviews @access Public (published reviews only) */
router.get(
  "/:courseId/reviews",
  optionalAuthenticate,
  validate(courseReviewsParamSchema),
  reviewController.listCourseReviews
);

/**
 * @route POST /api/v1/courses/:courseId/reviews
 * @desc  Create-or-update the current user's review for this course.
 * @access Private (course access required)
 */
router.post("/:courseId/reviews", authenticate, validate(upsertReviewSchema), reviewController.upsertReview);

/**
 * @route GET /api/v1/courses/:slug
 * @access Public
 * Mounted LAST among GET routes so it never shadows the more specific
 * /:courseId/... paths above (Express matches routes in order).
 */
router.get("/:slug", optionalAuthenticate, validate(courseSlugParamSchema), courseController.getCourse);

module.exports = router;
