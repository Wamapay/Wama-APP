"use strict";

const { Router } = require("express");
const userController = require("../controllers/user.controller");
const walletController = require("../controllers/wallet.controller");
const pushSubscriptionController = require("../controllers/pushSubscription.controller");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const { updateProfileSchema, setWithdrawalPinSchema, deactivateAccountSchema } = require("../validators/user.validator");
const { transactionListQuerySchema, rewardListQuerySchema } = require("../validators/financial.validator");

const router = Router();

/** @route GET /api/v1/users/me @access Private */
router.get("/me", authenticate, userController.getMe);

/** @route PATCH /api/v1/users/me @access Private */
router.patch("/me", authenticate, validate(updateProfileSchema), userController.updateMe);

/** @route POST /api/v1/users/me/profile-image @access Private — real upload, any signed-in user, own photo only */
router.post("/me/profile-image", authenticate, upload.single("file"), userController.uploadMyProfileImage);

/** @route GET /api/v1/users/me/dashboard-visibility @access Private */
router.get("/me/dashboard-visibility", authenticate, userController.getMyDashboardVisibility);

/** @route GET /api/v1/users/me/withdrawal-pin @access Private */
router.get("/me/withdrawal-pin", authenticate, userController.getMyWithdrawalPinStatus);

/** @route POST /api/v1/users/me/withdrawal-pin @access Private */
router.post("/me/withdrawal-pin", authenticate, validate(setWithdrawalPinSchema), userController.setMyWithdrawalPin);

/** @route GET /api/v1/users/me/notification-preferences @access Private */
router.get("/me/notification-preferences", authenticate, userController.getMyNotificationPreferences);

/** @route PATCH /api/v1/users/me/notification-preferences @access Private */
router.patch("/me/notification-preferences", authenticate, userController.updateMyNotificationPreferences);

/** @route GET /api/v1/users/me/profile-visibility @access Private */
router.get("/me/profile-visibility", authenticate, userController.getMyProfileVisibility);

/** @route PATCH /api/v1/users/me/profile-visibility @access Private */
router.patch("/me/profile-visibility", authenticate, userController.updateMyProfileVisibility);

/** @route POST /api/v1/users/me/deactivate @access Private — real self-service deactivation, requires password */
router.post("/me/deactivate", authenticate, validate(deactivateAccountSchema), userController.deactivateMyAccount);

/** @route POST /api/v1/users/me/data-export @access Private — real CSV, real email, via Resend */
router.post("/me/data-export", authenticate, userController.requestMyDataExport);

/** @route GET /api/v1/users/me/push-subscription/public-key @access Private */
router.get("/me/push-subscription/public-key", authenticate, pushSubscriptionController.getPublicKey);

/** @route POST /api/v1/users/me/push-subscription @access Private — real Web Push, no vendor needed */
router.post("/me/push-subscription", authenticate, pushSubscriptionController.subscribe);

/** @route DELETE /api/v1/users/me/push-subscription @access Private */
router.delete("/me/push-subscription", authenticate, pushSubscriptionController.unsubscribe);

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
