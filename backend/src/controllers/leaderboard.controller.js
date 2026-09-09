"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const leaderboardService = require("../services/leaderboard.service");

const getLeaderboard = asyncHandler(async (req, res) => {
  const result = await leaderboardService.getLeaderboard({
    limit: req.query.limit,
    forUserId: req.user ? req.user.id : null,
  });
  return ApiResponse.success(res, { message: "Leaderboard retrieved", data: result });
});

module.exports = { getLeaderboard };
