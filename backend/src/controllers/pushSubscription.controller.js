"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const webPushService = require("../services/webPush.service");
const { config } = require("../config/env");

const getPublicKey = asyncHandler(async (req, res) => {
  return ApiResponse.success(res, {
    message: "VAPID public key retrieved",
    data: { publicKey: config.vapid.publicKey || null },
  });
});

const subscribe = asyncHandler(async (req, res) => {
  await webPushService.subscribe(req.user.id, req.body);
  return ApiResponse.success(res, { statusCode: 201, message: "Subscribed to push notifications." });
});

const unsubscribe = asyncHandler(async (req, res) => {
  await webPushService.unsubscribe(req.user.id, req.body.endpoint);
  return ApiResponse.success(res, { message: "Unsubscribed from push notifications." });
});

module.exports = { getPublicKey, subscribe, unsubscribe };
