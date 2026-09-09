"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const userService = require("../services/user.service");
const platformSettings = require("../services/platformSettings.service");
const withdrawalPinService = require("../services/withdrawalPin.service");
const uploadService = require("../services/upload.service");
const dataExportService = require("../services/dataExport.service");
const ApiError = require("../utils/ApiError");
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

const getMyWithdrawalPinStatus = asyncHandler(async (req, res) => {
  const hasPinSet = await withdrawalPinService.hasWithdrawalPin(req.user.id);
  return ApiResponse.success(res, {
    message: "Withdrawal PIN status retrieved",
    data: { hasPinSet },
  });
});

const setMyWithdrawalPin = asyncHandler(async (req, res) => {
  await withdrawalPinService.setWithdrawalPin(req.user.id, req.body.pin, req.body.currentPassword);
  return ApiResponse.success(res, { message: "Withdrawal PIN set." });
});

/**
 * Real upload for a user's OWN profile photo — separate from the
 * admin-only /admin/uploads endpoint (course thumbnails/PDFs/platform
 * logo). Any authenticated user may upload their own photo; images
 * only, never PDF/video, and always scoped to the "profile-images"
 * folder regardless of what the client sends.
 */
const uploadMyProfileImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('No file was uploaded. Attach a file under the field name "file".');
  }
  const { url } = await uploadService.uploadFile(req.file.buffer, req.file.mimetype, "profile-images");
  return ApiResponse.success(res, { statusCode: 201, message: "Profile image uploaded", data: { url } });
});

const getMyNotificationPreferences = asyncHandler(async (req, res) => {
  const preferences = await userService.getNotificationPreferences(req.user.id);
  return ApiResponse.success(res, { message: "Notification preferences retrieved", data: { preferences } });
});

const updateMyNotificationPreferences = asyncHandler(async (req, res) => {
  const preferences = await userService.updateNotificationPreferences(req.user.id, req.body);
  return ApiResponse.success(res, { message: "Notification preferences updated", data: { preferences } });
});

const getMyProfileVisibility = asyncHandler(async (req, res) => {
  const preferences = await userService.getProfileVisibility(req.user.id);
  return ApiResponse.success(res, { message: "Profile visibility retrieved", data: { preferences } });
});

const updateMyProfileVisibility = asyncHandler(async (req, res) => {
  const preferences = await userService.updateProfileVisibility(req.user.id, req.body);
  return ApiResponse.success(res, { message: "Profile visibility updated", data: { preferences } });
});

const deactivateMyAccount = asyncHandler(async (req, res) => {
  await userService.deactivateAccount(req.user.id, req.body.currentPassword);
  return ApiResponse.success(res, { message: "Account deactivated. Log back in any time to reactivate it." });
});

const requestMyDataExport = asyncHandler(async (req, res) => {
  const result = await dataExportService.requestDataExport(req.user.id);
  if (!result.sent) {
    throw ApiError.internal("Couldn't send your data export right now. Please try again shortly.");
  }
  return ApiResponse.success(res, { message: "Your data export has been emailed to you." });
});

module.exports = {
  getMe,
  updateMe,
  getMyDashboardVisibility,
  getMyWithdrawalPinStatus,
  setMyWithdrawalPin,
  uploadMyProfileImage,
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  getMyProfileVisibility,
  updateMyProfileVisibility,
  deactivateMyAccount,
  requestMyDataExport,
};
