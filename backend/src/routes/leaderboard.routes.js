"use strict";

const { Router } = require("express");
const leaderboardController = require("../controllers/leaderboard.controller");
const optionalAuthenticate = require("../middleware/optionalAuthenticate");

const router = Router();

/** @route GET /api/v1/leaderboard @access Public (highlights the caller's own rank if logged in) */
router.get("/", optionalAuthenticate, leaderboardController.getLeaderboard);

module.exports = router;
