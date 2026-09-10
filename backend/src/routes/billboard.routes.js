"use strict";

const { Router } = require("express");
const billboardController = require("../controllers/billboard.controller");
const authenticate = require("../middleware/authenticate");

const router = Router();

/** @route GET /api/v1/billboard/activity @access Private (any signed-in user) */
router.get("/activity", authenticate, billboardController.listActivity);

module.exports = router;
