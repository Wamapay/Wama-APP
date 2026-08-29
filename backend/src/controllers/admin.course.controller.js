/**
 * Admin controller for Backend Stage 3: courses, categories, modules,
 * lessons, orders, and review moderation. Mounted under /api/v1/admin/*
 * (see routes/admin.routes.js), which already enforces
 * authenticate + requireRole(ADMIN, SUPER_ADMIN) at the router level.
 */
"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const categoryService = require("../services/category.service");
const courseService = require("../services/course.service");
const moduleService = require("../services/module.service");
const lessonService = require("../services/lesson.service");
const orderService = require("../services/order.service");
const reviewService = require("../services/review.service");
const { toPublicCategory, toCourseListItem, toCourseDetail, toAdminOrder, toPublicReview } = require("../models/course.mapper");

// --- Categories ---------------------------------------------------------

const listCategories = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await categoryService.listCategories({
    ...req.query,
    isAdmin: true,
  });
  return ApiResponse.success(res, {
    message: "Categories retrieved",
    data: { categories: items.map(toPublicCategory), total, page, pageSize },
  });
});

const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body);
  return ApiResponse.success(res, {
    statusCode: 201,
    message: "Category created",
    data: { category: toPublicCategory(category) },
  });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  return ApiResponse.success(res, { message: "Category updated", data: { category: toPublicCategory(category) } });
});

const archiveCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.archiveCategory(req.params.id);
  return ApiResponse.success(res, { message: "Category archived", data: { category: toPublicCategory(category) } });
});

const activateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.activateCategory(req.params.id);
  return ApiResponse.success(res, { message: "Category activated", data: { category: toPublicCategory(category) } });
});

// --- Courses --------------------------------------------------------------

const listCourses = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await courseService.listCourses(req.query, { isAdmin: true });
  return ApiResponse.success(res, {
    message: "Courses retrieved",
    data: { courses: items.map(toCourseListItem), total, page, pageSize },
  });
});

const getCourse = asyncHandler(async (req, res) => {
  const course = await courseService.getCourseById(req.params.id);
  return ApiResponse.success(res, { message: "Course retrieved", data: { course: toCourseDetail(course) } });
});

const createCourse = asyncHandler(async (req, res) => {
  const course = await courseService.createCourse(req.body);
  return ApiResponse.success(res, { statusCode: 201, message: "Course created", data: { course: toCourseDetail(course) } });
});

const updateCourse = asyncHandler(async (req, res) => {
  const course = await courseService.updateCourse(req.params.id, req.body);
  return ApiResponse.success(res, { message: "Course updated", data: { course: toCourseDetail(course) } });
});

const publishCourse = asyncHandler(async (req, res) => {
  const course = await courseService.setCourseStatus(req.params.id, "PUBLISHED");
  return ApiResponse.success(res, { message: "Course published", data: { course: toCourseDetail(course) } });
});

const unpublishCourse = asyncHandler(async (req, res) => {
  const course = await courseService.setCourseStatus(req.params.id, "UNPUBLISHED");
  return ApiResponse.success(res, { message: "Course unpublished", data: { course: toCourseDetail(course) } });
});

const archiveCourse = asyncHandler(async (req, res) => {
  const course = await courseService.setCourseStatus(req.params.id, "ARCHIVED");
  return ApiResponse.success(res, { message: "Course archived", data: { course: toCourseDetail(course) } });
});

// --- Modules ----------------------------------------------------------

const createModule = asyncHandler(async (req, res) => {
  const mod = await moduleService.createModule(req.params.courseId, req.body);
  return ApiResponse.success(res, { statusCode: 201, message: "Module created", data: { module: mod } });
});

const updateModule = asyncHandler(async (req, res) => {
  const mod = await moduleService.updateModule(req.params.id, req.body);
  return ApiResponse.success(res, { message: "Module updated", data: { module: mod } });
});

const deleteModule = asyncHandler(async (req, res) => {
  await moduleService.deleteModule(req.params.id);
  return ApiResponse.success(res, { message: "Module deleted", data: null });
});

const reorderModules = asyncHandler(async (req, res) => {
  const modules = await moduleService.reorderModules(req.params.courseId, req.body.order);
  return ApiResponse.success(res, { message: "Modules reordered", data: { modules } });
});

// --- Lessons ------------------------------------------------------------

const createLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.createLesson(req.params.moduleId, req.body);
  return ApiResponse.success(res, { statusCode: 201, message: "Lesson created", data: { lesson } });
});

const updateLesson = asyncHandler(async (req, res) => {
  const lesson = await lessonService.updateLesson(req.params.id, req.body);
  return ApiResponse.success(res, { message: "Lesson updated", data: { lesson } });
});

const deleteLesson = asyncHandler(async (req, res) => {
  await lessonService.deleteLesson(req.params.id);
  return ApiResponse.success(res, { message: "Lesson deleted", data: null });
});

const reorderLessons = asyncHandler(async (req, res) => {
  const lessons = await lessonService.reorderLessons(req.params.moduleId, req.body.order);
  return ApiResponse.success(res, { message: "Lessons reordered", data: { lessons } });
});

// --- Orders (read-only — no refund/cancellation surface exists) --------

const listOrders = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await orderService.listOrdersAdmin(req.query);
  return ApiResponse.success(res, {
    message: "Orders retrieved",
    data: { orders: items.map(toAdminOrder), total, page, pageSize },
  });
});

const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id, { isAdmin: true });
  return ApiResponse.success(res, { message: "Order retrieved", data: { order: toAdminOrder(order) } });
});

// --- Review moderation ----------------------------------------------------

const listReviews = asyncHandler(async (req, res) => {
  const { courseId } = req.query;
  if (!courseId) {
    return ApiResponse.error(res, { statusCode: 400, message: "courseId query parameter is required." });
  }
  const { items, total, page, pageSize } = await reviewService.listReviewsForCourse(courseId, {
    ...req.query,
    isAdmin: true,
  });
  return ApiResponse.success(res, {
    message: "Reviews retrieved",
    data: { reviews: items.map(toPublicReview), total, page, pageSize },
  });
});

const approveReview = asyncHandler(async (req, res) => {
  const review = await reviewService.setReviewStatus(req.params.id, "PUBLISHED");
  return ApiResponse.success(res, { message: "Review published", data: { review: toPublicReview(review) } });
});

const hideReview = asyncHandler(async (req, res) => {
  const review = await reviewService.setReviewStatus(req.params.id, "HIDDEN");
  return ApiResponse.success(res, { message: "Review hidden", data: { review: toPublicReview(review) } });
});

const deleteReview = asyncHandler(async (req, res) => {
  await reviewService.deleteReview(req.params.id);
  return ApiResponse.success(res, { message: "Review deleted", data: null });
});

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  activateCategory,
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  publishCourse,
  unpublishCourse,
  archiveCourse,
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  listOrders,
  getOrder,
  listReviews,
  approveReview,
  hideReview,
  deleteReview,
};
