"use strict";

/**
 * Withdrawal routes (Backend Stage 4). See withdrawal.service.js for the
 * business logic and withdrawal.controller.js for request handling.
 */

const { Router } = require("express");
const withdrawalController = require("../controllers/withdrawal.controller");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const {
  createWithdrawalSchema,
  withdrawalIdParamSchema,
  withdrawalListQuerySchema,
} = require("../validators/financial.validator");

const router = Router();

router.use(authenticate);

/** @route POST /api/v1/withdrawals @access Private */
router.post("/", validate(createWithdrawalSchema), withdrawalController.createWithdrawal);

/** @route GET /api/v1/withdrawals @access Private (own withdrawals only) */
router.get("/", validate(withdrawalListQuerySchema), withdrawalController.listMyWithdrawals);

/**
 * @route GET /api/v1/withdrawals/banks?type=mobile_money|bank
 * @desc  Real, live Paystack Ghana bank/Mobile-Money-network codes —
 *        added so the withdrawal form never has to guess/hardcode a
 *        bank code (see paystack.service.js#listGhanaBanks). Must be
 *        registered before "/:id" so "banks" isn't parsed as an id.
 * @access Private
 */
router.get("/banks", withdrawalController.listBanks);

/** @route GET /api/v1/withdrawals/:id @access Private (own withdrawal only) */
router.get("/:id", validate(withdrawalIdParamSchema), withdrawalController.getMyWithdrawal);

module.exports = router;
