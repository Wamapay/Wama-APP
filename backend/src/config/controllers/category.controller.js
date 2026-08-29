"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const categoryService = require("../services/category.service");
const { toPublicCategory } = require("../models/course.mapper");

// --- Public -----------------------------------------------------------

const listCategories = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await categoryService.listCategories({
    ...req.query,
    isAdmin: false,
  });
  return ApiResponse.success(res, {
    message: "Categories retrieved",
    data: { categories: items.map(toPublicCategory), total, page, pageSize },
  });
});

const getCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryBySlug(req.params.slug, { isAdmin: false });
  return ApiResponse.success(res, {
    message: "Category retrieved",
    data: { category: toPublicCategory(category) },
  });
});

// --- Admin --------------------------------------------------------------

const adminListCategories = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await categoryService.listCategories({
    ...req.query,
    isAdmin: true,
  });
  return ApiResponse.success(res, {
    message: "Categories retrieved",
    data: { categories: items.map(toPublicCategory), total, page, pageSize },
  });
});

const adminCreateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body);
  return ApiResponse.success(res, {
    statusCode: 201,
    message: "Category created",
    data: { category: toPublicCategory(category) },
  });
});

const adminUpdateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  return ApiResponse.success(res, {
    message: "Category updated",
    data: { category: toPublicCategory(category) },
  });
});

const adminArchiveCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.archiveCategory(req.params.id);
  return ApiResponse.success(res, {
    message: "Category archived",
    data: { category: toPublicCategory(category) },
  });
});

const adminActivateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.activateCategory(req.params.id);
  return ApiResponse.success(res, {
    message: "Category activated",
    data: { category: toPublicCategory(category) },
  });
});

module.exports = {
  listCategories,
  getCategory,
  adminListCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminArchiveCategory,
  adminActivateCategory,
};
