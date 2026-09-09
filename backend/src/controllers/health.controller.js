"use strict";

const os = require("os");
const { config } = require("../config/env");
const ApiResponse = require("../utils/apiResponse");

const startedAt = Date.now();

function getHealth(req, res) {
  return ApiResponse.success(res, {
    message: "API is running",
    data: {
      success: true,
      version: config.apiVersion,
      environment: config.env,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      host: os.hostname(),
      databaseConfigured: Boolean(config.database.url),
    },
  });
}

module.exports = { getHealth };
