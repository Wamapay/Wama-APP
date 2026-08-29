"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const orderService = require("../services/order.service");
const { toPublicOrder, toAdminOrder } = require("../models/course.mapper");

const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder({
    userId: req.user.id,
    courseId: req.body.courseId,
    referralCode: req.body.referralCode,
  });
  return ApiResponse.success(res, {
    statusCode: 201,
    message: "Order created",
    data: { order: toPublicOrder(order) },
  });
});

const listMyOrders = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await orderService.listOrdersForUser(req.user.id, req.query);
  return ApiResponse.success(res, {
    message: "Orders retrieved",
    data: { orders: items.map(toPublicOrder), total, page, pageSize },
  });
});

const getMyOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id, { userId: req.user.id, isAdmin: false });
  return ApiResponse.success(res, { message: "Order retrieved", data: { order: toPublicOrder(order) } });
});

// --- Admin ----------------------------------------------------------------

const adminListOrders = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await orderService.listOrdersAdmin(req.query);
  return ApiResponse.success(res, {
    message: "Orders retrieved",
    data: { orders: items.map(toAdminOrder), total, page, pageSize },
  });
});

const adminGetOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id, { isAdmin: true });
  return ApiResponse.success(res, { message: "Order retrieved", data: { order: toAdminOrder(order) } });
});

module.exports = { createOrder, listMyOrders, getMyOrder, adminListOrders, adminGetOrder };
