"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const paymentService = require("../services/payment.service");
const { toPublicPayment, toAdminPayment } = require("../models/payment.mapper");
const { toPublicOrder } = require("../models/course.mapper");

/** @route POST /api/v1/payments/paystack/initialize @access Private */
const initialize = asyncHandler(async (req, res) => {
  const { payment, authorizationUrl, accessCode, reference } = await paymentService.initializePayment({
    orderId: req.body.orderId,
    userId: req.user.id,
    userEmail: req.user.email,
  });

  // Only what the frontend needs to continue the Paystack flow — never
  // the secret key, never internal DB/financial data. See "Paystack
  // Initialization Response".
  return ApiResponse.success(res, {
    statusCode: 201,
    message: "Payment initialized",
    data: {
      payment: toPublicPayment(payment),
      authorizationUrl,
      accessCode,
      reference,
    },
  });
});

/** @route GET /api/v1/payments/paystack/verify/:reference @access Private */
const verify = asyncHandler(async (req, res) => {
  const result = await paymentService.verifyPayment({
    reference: req.params.reference,
    userId: req.user.id,
    isAdmin: false,
  });

  const success = result.outcome === "SUCCESS";
  return ApiResponse.success(res, {
    message: success ? "Payment verified successfully" : `Payment verification result: ${result.outcome}`,
    data: {
      status: result.outcome,
      payment: toPublicPayment(result.payment),
      order: toPublicOrder(result.order),
    },
  });
});

/** @route POST /api/v1/payments/paystack/webhook @access Public (Paystack only, signature-verified) */
const webhook = asyncHandler(async (req, res) => {
  await paymentService.handleWebhookEvent({
    rawBody: req.rawBody,
    signature: req.headers["x-paystack-signature"],
  });
  // Paystack only needs a 200 acknowledgement — see "Webhook Processing".
  return res.status(200).json({ received: true });
});

/** @route GET /api/v1/payments @access Private */
const listMyPayments = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await paymentService.listPaymentsForUser(req.user.id, req.query);
  return ApiResponse.success(res, {
    message: "Payments retrieved",
    data: { payments: items.map(toPublicPayment), total, page, pageSize },
  });
});

/** @route GET /api/v1/payments/:reference @access Private */
const getMyPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPaymentByReference(req.params.reference, {
    userId: req.user.id,
    isAdmin: false,
  });
  return ApiResponse.success(res, { message: "Payment retrieved", data: { payment: toPublicPayment(payment) } });
});

// --- Admin -----------------------------------------------------------------

/** @route GET /api/v1/admin/payments @access Admin */
const adminListPayments = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await paymentService.listPaymentsAdmin(req.query);
  return ApiResponse.success(res, {
    message: "Payments retrieved",
    data: { payments: items.map(toAdminPayment), total, page, pageSize },
  });
});

/** @route GET /api/v1/admin/payments/:reference @access Admin */
const adminGetPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPaymentByReference(req.params.reference, { isAdmin: true });
  return ApiResponse.success(res, { message: "Payment retrieved", data: { payment: toAdminPayment(payment) } });
});

module.exports = {
  initialize,
  verify,
  webhook,
  listMyPayments,
  getMyPayment,
  adminListPayments,
  adminGetPayment,
};
