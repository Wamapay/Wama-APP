"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const userService = require("../services/user.service");
const platformSettings = require("../services/platformSettings.service");
const { toPublicUser } = require("../models/user.mapper");

const getMe = asyncHandler(async (req, res) => {
  const user = await userService.getUserWithAgent(req.user.id);
  return ApiResponse.success(res, {
    message: "Current user profile",
    data: { user: toPublicUser(user) },
  });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.body);
  return ApiResponse.success(res, {
    message: "Profile updated successfully",
    data: { user: toPublicUser(user) },
  });
});

const getMyDashboardVisibility = asyncHandler(async (req, res) => {
  const visibleSections = await platformSettings.getVisibleSectionsForUser(req.user.id);
  return ApiResponse.success(res, {
    message: "Dashboard visibility retrieved",
    data: { visibleSections },
  });
});

module.exports = { getMe, updateMe, getMyDashboardVisibility };
