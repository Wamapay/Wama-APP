"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const courseService = require("../services/course.service");
const { toCourseListItem, toCourseDetail } = require("../models/course.mapper");
const { ADMIN_ROLES } = require("../config/adminPermissions");

function isAdminRequest(req) {
  return Boolean(req.user && ADMIN_ROLES.includes(req.user.role));
}

// --- Public discovery -----------------------------------------------------

const listCourses = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await courseService.listCourses(req.query, {
    isAdmin: isAdminRequest(req),
  });
  return ApiResponse.success(res, {
    message: "Courses retrieved",
    data: { courses: items.map(toCourseListItem), total, page, pageSize },
  });
});

const getCourse = asyncHandler(async (req, res) => {
  const course = await courseService.getCourseBySlug(req.params.slug, { isAdmin: isAdminRequest(req) });
  return ApiResponse.success(res, {
    message: "Course retrieved",
    data: { course: toCourseDetail(course) },
  });
});

// --- Admin ----------------------------------------------------------------

const adminListCourses = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await courseService.listCourses(req.query, { isAdmin: true });
  return ApiResponse.success(res, {
    message: "Courses retrieved",
    data: { courses: items.map(toCourseListItem), total, page, pageSize },
  });
});

const adminGetCourse = asyncHandler(async (req, res) => {
  const course = await courseService.getCourseById(req.params.id);
  return ApiResponse.success(res, { message: "Course retrieved", data: { course: toCourseDetail(course) } });
});

const adminCreateCourse = asyncHandler(async (req, res) => {
  const course = await courseService.createCourse(req.body);
  return ApiResponse.success(res, {
    statusCode: 201,
    message: "Course created",
    data: { course: toCourseDetail(course) },
  });
});

const adminUpdateCourse = asyncHandler(async (req, res) => {
  const course = await courseService.updateCourse(req.params.id, req.body);
  return ApiResponse.success(res, { message: "Course updated", data: { course: toCourseDetail(course) } });
});

const adminPublishCourse = asyncHandler(async (req, res) => {
  const course = await courseService.setCourseStatus(req.params.id, "PUBLISHED");
  return ApiResponse.success(res, { message: "Course published", data: { course: toCourseDetail(course) } });
});

const adminUnpublishCourse = asyncHandler(async (req, res) => {
  const course = await courseService.setCourseStatus(req.params.id, "UNPUBLISHED");
  return ApiResponse.success(res, { message: "Course unpublished", data: { course: toCourseDetail(course) } });
});

const adminArchiveCourse = asyncHandler(async (req, res) => {
  const course = await courseService.setCourseStatus(req.params.id, "ARCHIVED");
  return ApiResponse.success(res, { message: "Course archived", data: { course: toCourseDetail(course) } });
});

module.exports = {
  listCourses,
  getCourse,
  adminListCourses,
  adminGetCourse,
  adminCreateCourse,
  adminUpdateCourse,
  adminPublishCourse,
  adminUnpublishCourse,
  adminArchiveCourse,
};
