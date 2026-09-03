"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const moduleService = require("../services/module.service");

const adminCreateModule = asyncHandler(async (req, res) => {
  const mod = await moduleService.createModule(req.params.courseId, req.body);
  return ApiResponse.success(res, { statusCode: 201, message: "Module created", data: { module: mod } });
});

const adminUpdateModule = asyncHandler(async (req, res) => {
  const mod = await moduleService.updateModule(req.params.id, req.body);
  return ApiResponse.success(res, { message: "Module updated", data: { module: mod } });
});

const adminDeleteModule = asyncHandler(async (req, res) => {
  await moduleService.deleteModule(req.params.id);
  return ApiResponse.success(res, { message: "Module deleted", data: null });
});

const adminReorderModules = asyncHandler(async (req, res) => {
  const modules = await moduleService.reorderModules(req.params.courseId, req.body.order);
  return ApiResponse.success(res, { message: "Modules reordered", data: { modules } });
});

module.exports = { adminCreateModule, adminUpdateModule, adminDeleteModule, adminReorderModules };
