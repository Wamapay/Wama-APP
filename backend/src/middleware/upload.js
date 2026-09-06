/**
 * Multer configuration for real file uploads (images/PDFs — see
 * upload.service.js). Memory storage, not disk: files are held in
 * memory only long enough to stream straight to Cloudinary, never
 * written to this server's own filesystem (which is ephemeral anyway
 * on Railway, so writing to disk here would be pointless).
 */
"use strict";

const multer = require("multer");

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — generous for a thumbnail/PDF, not video

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

module.exports = upload;
