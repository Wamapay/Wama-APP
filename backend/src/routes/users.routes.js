"use strict";

const { Router } = require("express");
const userController = require("../controllers/user.controller");
const walletController = require("../controllers/wallet.controller");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { updateProfileSchema } = require("../validators/user.validator");
const { transactionListQuerySchema, rewardListQuerySchema } = require("../validators/financial.validator");

const router = Router();

/** @route GET /api/v1/users/me @access Private */
router.get("/me", authenticate, userController.getMe);

/** @route PATCH /api/v1/users/me @access Private */
router.patch("/me", authenticate, validate(updateProfileSchema), userController.updateMe);

// --- Financial engine (Backend Stage 4) ------------------------------

/** @route GET /api/v1/users/me/balances @access Private */
router.get("/me/balances", authenticate, walletController.getMyBalances);

/** @route GET /api/v1/users/me/transactions @access Private */
router.get(
  "/me/transactions",
  authenticate,
  validate(transactionListQuerySchema),
  walletController.listMyTransactions
);

/** @route GET /api/v1/users/me/cashback @access Private */
router.get("/me/cashback", authenticate, validate(transactionListQuerySchema), walletController.listMyCashback);

/** @route GET /api/v1/users/me/commissions @access Private */
router.get(
  "/me/commissions",
  authenticate,
  validate(transactionListQuerySchema),
  walletController.listMyCommissions
);

/** @route GET /api/v1/users/me/rewards @access Private */
router.get("/me/rewards", authenticate, validate(rewardListQuerySchema), walletController.listMyRewards);

module.exports = router;
