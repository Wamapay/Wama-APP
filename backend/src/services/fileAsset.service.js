/**
 * Digital file (FileAsset) metadata — architecture prep for object/file
 * storage (e.g. S3-compatible buckets + signed URLs). No storage provider
 * is wired up yet; this only stores metadata and enforces that protected
 * files are never handed out without a course-access check first.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const courseAccessService = require("./courseAccess.service");

async function attachFileToLesson({ lessonId, courseId, uploadedBy, fileName, fileType, mimeType, fileSize, storageKey, url }) {
  return prisma.fileAsset.create({
    data: { lessonId, courseId, uploadedBy, fileName, fileType, mimeType, fileSize, storageKey, url },
  });
}

async function attachFileToCourse({ courseId, uploadedBy, fileName, fileType, mimeType, fileSize, storageKey, url }) {
  return prisma.fileAsset.create({
    data: { courseId, uploadedBy, fileName, fileType, mimeType, fileSize, storageKey, url },
  });
}

async function listFilesForLesson(lessonId) {
  return prisma.fileAsset.findMany({ where: { lessonId } });
}

/**
 * Return file metadata (never a raw storage credential) after verifying
 * the requesting user actually has access to the course it belongs to.
 * A real storage integration (later stage) would exchange this for a
 * short-lived signed download URL instead of the stored `url`.
 */
async function getAuthorizedFile(userId, fileId) {
  const file = await prisma.fileAsset.findUnique({ where: { id: fileId } });
  if (!file) {
    throw ApiError.notFound("File not found.");
  }

  const courseId = file.courseId;
  if (courseId) {
    const access = await courseAccessService.hasCourseAccess(userId, courseId);
    if (!access) {
      throw ApiError.forbidden("You do not have access to this file.");
    }
  }

  return file;
}

module.exports = { attachFileToLesson, attachFileToCourse, listFilesForLesson, getAuthorizedFile };
