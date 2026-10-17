"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const creatorService = require("../services/creator.service");
const moduleService = require("../services/module.service");
const lessonService = require("../services/lesson.service");
const { toCourseDetail, toCourseListItem } = require("../models/course.mapper");

const withApproval = (c) => ({ ...toCourseListItem(c), approvalStatus: c.approvalStatus, rejectionReason: c.rejectionReason });

const listCourses = asyncHandler(async (req, res) => {
  const courses = await creatorService.listMyCourses(req.creator.id);
  return ApiResponse.success(res, { message: "Products retrieved", data: { courses: courses.map(withApproval) } });
});

const getCourse = asyncHandler(async (req, res) => {
  const course = await creatorService.getMyCourse(req.creator.id, req.params.id);
  return ApiResponse.success(res, { message: "Product retrieved", data: { course: toCourseDetail(course) } });
});

const createCourse = asyncHandler(async (req, res) => {
  const course = await creatorService.createMyCourse(req.creator, req.body);
  return ApiResponse.success(res, { statusCode: 201, message: "Product created", data: { course: toCourseDetail(course) } });
});

const updateCourse = asyncHandler(async (req, res) => {
  const course = await creatorService.updateMyCourse(req.creator.id, req.params.id, req.body);
  return ApiResponse.success(res, { message: "Product updated", data: { course: toCourseDetail(course) } });
});

const submit = asyncHandler(async (req, res) => {
  const course = await creatorService.submitForReview(req.creator.id, req.params.id);
  return ApiResponse.success(res, { message: "Submitted for review", data: { course: toCourseDetail(course) } });
});

const unpublish = asyncHandler(async (req, res) => {
  const course = await creatorService.unpublishMine(req.creator.id, req.params.id);
  return ApiResponse.success(res, { message: "Product unpublished", data: { course: toCourseDetail(course) } });
});

const republish = asyncHandler(async (req, res) => {
  const course = await creatorService.republishMine(req.creator.id, req.params.id);
  return ApiResponse.success(res, { message: "Product is live again", data: { course: toCourseDetail(course) } });
});

// --- Modules / lessons (ownership checked before reusing the shared services)

const createModule = asyncHandler(async (req, res) => {
  await creatorService.getOwnedCourse(req.creator.id, req.params.courseId);
  const mod = await moduleService.createModule(req.params.courseId, req.body);
  return ApiResponse.success(res, { statusCode: 201, message: "Module created", data: { module: mod } });
});

const updateModule = asyncHandler(async (req, res) => {
  await creatorService.getOwnedModule(req.creator.id, req.params.id);
  const mod = await moduleService.updateModule(req.params.id, req.body);
  return ApiResponse.success(res, { message: "Module updated", data: { module: mod } });
});

const deleteModule = asyncHandler(async (req, res) => {
  await creatorService.getOwnedModule(req.creator.id, req.params.id);
  await moduleService.deleteModule(req.params.id);
  return ApiResponse.success(res, { message: "Module deleted", data: null });
});

const createLesson = asyncHandler(async (req, res) => {
  await creatorService.getOwnedModule(req.creator.id, req.params.moduleId);
  const lesson = await lessonService.createLesson(req.params.moduleId, req.body);
  return ApiResponse.success(res, { statusCode: 201, message: "Lesson created", data: { lesson } });
});

const updateLesson = asyncHandler(async (req, res) => {
  await creatorService.getOwnedLesson(req.creator.id, req.params.id);
  const lesson = await lessonService.updateLesson(req.params.id, req.body);
  return ApiResponse.success(res, { message: "Lesson updated", data: { lesson } });
});

const deleteLesson = asyncHandler(async (req, res) => {
  await creatorService.getOwnedLesson(req.creator.id, req.params.id);
  await lessonService.deleteLesson(req.params.id);
  return ApiResponse.success(res, { message: "Lesson deleted", data: null });
});

const earnings = asyncHandler(async (req, res) => {
  const summary = await creatorService.getEarningsSummary(req.creator.id);
  return ApiResponse.success(res, { message: "Earnings retrieved", data: summary });
});

module.exports = {
  listCourses, getCourse, createCourse, updateCourse, submit, unpublish, republish,
  createModule, updateModule, deleteModule, createLesson, updateLesson, deleteLesson, earnings,
};
