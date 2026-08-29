"use strict";

/**
 * Dev/test-only routes. Only mounted (see routes/index.js) when
 * config.enableDevRoutes is true — which is forced false in production
 * regardless of the ENABLE_DEV_ROUTES env value (see config/env.js).
 */
const { Router } = require("express");
const devController = require("../controllers/dev.controller");
const authenticate = require("../middleware/authenticate");

const router = Router();

router.post("/simulate-purchase", authenticate, devController.simulateQualifyingPurchase);
router.post("/simulate-referral-success", authenticate, devController.simulateSuccessfulReferrals);
router.post("/orders/:orderId/simulate-payment", authenticate, devController.simulateSuccessfulPayment);

module.exports = router;
