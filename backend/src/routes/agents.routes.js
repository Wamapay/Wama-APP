"use strict";

const { Router } = require("express");
const agentController = require("../controllers/agent.controller");
const authenticate = require("../middleware/authenticate");

const router = Router();

/** @route GET /api/v1/agents/me @access Private (Agent) */
router.get("/me", authenticate, agentController.getMe);

/** @route GET /api/v1/agents/me/financial-summary @access Private (Agent) — Backend Stage 4 */
router.get("/me/financial-summary", authenticate, agentController.getMyFinancialSummary);

module.exports = router;
