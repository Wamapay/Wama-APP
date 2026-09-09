"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const billboardService = require("../services/billboard.service");

const listActivity = asyncHandler(async (req, res) => {
  const activity = await billboardService.listBillboardActivity(req.query.limit);
  return ApiResponse.success(res, { message: "Billboard activity retrieved", data: { activity } });
});

const listFeaturedEntries = asyncHandler(async (req, res) => {
  const entries = await billboardService.listAllFeaturedEntries();
  return ApiResponse.success(res, { message: "Featured entries retrieved", data: { entries } });
});

const createFeaturedEntry = asyncHandler(async (req, res) => {
  const entry = await billboardService.createFeaturedEntry({
    adminId: req.user.id,
    name: req.body.name,
    imageUrl: req.body.imageUrl,
    message: req.body.message,
    durationDays: req.body.durationDays,
  });
  return ApiResponse.success(res, { statusCode: 201, message: "Featured entry created", data: { entry } });
});

const deleteFeaturedEntry = asyncHandler(async (req, res) => {
  await billboardService.deleteFeaturedEntry(req.params.id);
  return ApiResponse.success(res, { message: "Featured entry deleted" });
});

module.exports = { listActivity, listFeaturedEntries, createFeaturedEntry, deleteFeaturedEntry };
