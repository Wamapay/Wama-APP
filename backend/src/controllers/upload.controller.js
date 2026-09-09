"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const uploadService = require("../services/upload.service");

const ALLOWED_FOLDERS = ["course-thumbnails", "lesson-materials", "platform-logo", "profile-images"];

const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest("No file was uploaded. Attach a file under the field name \"file\".");
  }
  const folder = ALLOWED_FOLDERS.includes(req.body.folder) ? req.body.folder : "course-thumbnails";

  const { url } = await uploadService.uploadFile(req.file.buffer, req.file.mimetype, folder);

  return ApiResponse.success(res, { statusCode: 201, message: "File uploaded", data: { url } });
});

module.exports = { uploadFile };
