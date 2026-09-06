"use strict";

const { Router } = require("express");
const { getHealth } = require("../controllers/health.controller");

const router = Router();

/**
 * @route GET /api/v1/health
 * @desc  Basic liveness/readiness check for the API.
 * @access Public
 */
router.get("/", getHealth);

module.exports = router;
