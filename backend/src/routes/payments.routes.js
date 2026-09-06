"use strict";

/**
 * Payment (Paystack) routes for the authenticated buyer.
 * Admin payment visibility lives under /api/v1/admin/payments (see
 * admin.routes.js).
 */
const { Router } = require("express");
const paymentController = require("../controllers/payment.controller");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const {
  initializePaymentSchema,
  referenceParamSchema,
  paymentListQuerySchema,
} = require("../validators/payment.validator");

const router = Router();

/**
 * @route POST /api/v1/payments/paystack/webhook
 * @desc  Paystack server-to-server event delivery.
 * @access Public — NOT behind `authenticate` (Paystack never sends a
 *         bearer token). Trust instead comes entirely from verifying the
 *         x-paystack-signature header inside the controller/service — see
 *         payment.service.js#handleWebhookEvent.
 */
router.post("/paystack/webhook", paymentController.webhook);

// Everything below requires a logged-in user.
router.use(authenticate);

/** @route POST /api/v1/payments/paystack/initialize @desc Start a Paystack payment for one of the user's own orders @access Private */
router.post("/paystack/initialize", validate(initializePaymentSchema), paymentController.initialize);

/** @route GET /api/v1/payments/paystack/verify/:reference @desc Independently verify a payment against Paystack @access Private */
router.get("/paystack/verify/:reference", validate(referenceParamSchema), paymentController.verify);

/** @route GET /api/v1/payments @desc Current user's payment history @access Private */
router.get("/", validate(paymentListQuerySchema), paymentController.listMyPayments);

/** @route GET /api/v1/payments/:reference @desc Current user's own payment only @access Private */
router.get("/:reference", validate(referenceParamSchema), paymentController.getMyPayment);

module.exports = router;
