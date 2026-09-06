"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const notificationService = require("../services/notification.service");

const listMine = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize, unreadCount } = await notificationService.listForUser(
    req.user.id,
    req.query
  );
  return ApiResponse.success(res, {
    message: "Notifications retrieved",
    data: { notifications: items, total, page, pageSize, unreadCount },
  });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.user.id, req.params.id);
  return ApiResponse.success(res, { message: "Notification marked as read", data: { notification } });
});

const markAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.user.id);
  return ApiResponse.success(res, { message: "All notifications marked as read", data: result });
});

module.exports = { listMine, markRead, markAllRead };
