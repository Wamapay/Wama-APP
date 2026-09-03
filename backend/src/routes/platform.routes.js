"use strict";

const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const platformSettings = require("../services/platformSettings.service");

const router = Router();

/**
 * @route GET /api/v1/platform
 * @access Public — deliberately no `authenticate` middleware. The
 * login/signup screens themselves need the platform name/logo before
 * anyone has a token. Returns ONLY the 5 identity fields (see
 * platformSettings.service.js getPlatformIdentity) — never any rate,
 * threshold, or feature-flag setting.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const identity = await platformSettings.getPlatformIdentity();
    return ApiResponse.success(res, { message: "Platform identity retrieved", data: { platform: identity } });
  })
);

module.exports = router;
