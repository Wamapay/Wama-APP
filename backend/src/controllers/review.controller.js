"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const reviewService = require("../services/review.service");
const courseService = require("../services/course.service");
const { toPublicReview } = require("../models/course.mapper");
const { ADMIN_ROLES } = require("../config/adminPermissions");

const upsertReview = asyncHandler(async (req, res) => {
  const review = await reviewService.upsertReview(req.user.id, req.params.courseId, req.body);
  return ApiResponse.success(res, {
    message: "Review saved",
    data: { review: toPublicReview(review) },
  });
});

const listCourseReviews = asyncHandler(async (req, res) => {
  const isAdmin = Boolean(req.user && ADMIN_ROLES.includes(req.user.role));
  const [{ items, total, page, pageSize }, ratingSummary] = await Promise.all([
    reviewService.listReviewsForCourse(req.params.courseId, { ...req.query, isAdmin }),
    courseService.getRatingSummary(req.params.courseId),
  ]);
  return ApiResponse.success(res, {
    message: "Reviews retrieved",
    data: { reviews: items.map(toPublicReview), total, page, pageSize, ratingSummary },
  });
});

// --- Admin ------------------------------------------------------------

const adminListReviews = asyncHandler(async (req, res) => {
  const courseId = req.query.courseId;
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

const adminApproveReview = asyncHandler(async (req, res) => {
  const review = await reviewService.setReviewStatus(req.params.id, "PUBLISHED");
  return ApiResponse.success(res, { message: "Review approved", data: { review: toPublicReview(review) } });
});

const adminHideReview = asyncHandler(async (req, res) => {
  const review = await reviewService.setReviewStatus(req.params.id, "HIDDEN");
  return ApiResponse.success(res, { message: "Review hidden", data: { review: toPublicReview(review) } });
});

const adminDeleteReview = asyncHandler(async (req, res) => {
  await reviewService.deleteReview(req.params.id);
  return ApiResponse.success(res, { message: "Review deleted", data: null });
});

module.exports = {
  upsertReview,
  listCourseReviews,
  adminListReviews,
  adminApproveReview,
  adminHideReview,
  adminDeleteReview,
};
