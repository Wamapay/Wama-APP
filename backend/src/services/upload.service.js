/**
 * Real file uploads — Cloudinary. Used for course thumbnails, lesson PDF
 * materials, and the platform logo. Deliberately NOT used for video:
 * video stays a pasted link (YouTube/Vimeo/etc.) rather than a real
 * upload — see src/config/env.js's cloudinary block for why.
 *
 * The API key/secret never leave this backend — never logged, never
 * returned in any API response. Only the final, public Cloudinary URL
 * is ever sent back to the frontend.
 */
"use strict";

const { v2: cloudinary } = require("cloudinary");
const { config } = require("../config/env");
const ApiError = require("../utils/ApiError");
const logger = require("../config/logger");

const ALLOWED_MIME_TYPES = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "raw", // Cloudinary calls non-image/video files "raw"
};

let configured = false;
function ensureConfigured() {
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    throw ApiError.internal(
      "File uploads are not configured on this server yet (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET missing)."
    );
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true,
    });
    configured = true;
  }
}

/**
 * @param {Buffer} buffer - the raw file bytes (from multer's memory storage)
 * @param {string} mimetype - the browser-reported content type
 * @param {string} folder - a Cloudinary folder to organize uploads by
 * purpose, e.g. "course-thumbnails", "lesson-materials", "platform-logo"
 * @returns {Promise<{url: string}>}
 */
async function uploadFile(buffer, mimetype, folder) {
  ensureConfigured();

  const resourceType = ALLOWED_MIME_TYPES[mimetype];
  if (!resourceType) {
    throw ApiError.badRequest(
      `Unsupported file type (${mimetype}). Only JPEG, PNG, WEBP, GIF images and PDF files are accepted.`
    );
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `wamton/${folder}`, resource_type: resourceType },
      (err, result) => {
        if (err) {
          logger.error(`[upload] Cloudinary rejected the upload: ${err.message}`);
          return reject(ApiError.internal("Couldn't upload the file. Please try again."));
        }
        resolve({ url: result.secure_url });
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadFile, ALLOWED_MIME_TYPES };
