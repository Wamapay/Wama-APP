/**
 * Lesson business logic. Admin write access only — see admin.routes.js.
 * No quizzes, no assessments — see LESSON_TYPES in the lesson validator.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");
const moduleService = require("./module.service");

async function getLessonById(id) {
  const lesson = await prisma.lesson.findUnique({ where: { id }, include: { module: true } });
  if (!lesson) {
    throw ApiError.notFound("Lesson not found.");
  }
  return lesson;
}

/**
 * Fetch a lesson while enforcing it actually belongs to the given course —
 * prevents a lesson from Course A being reachable through Course B's URL.
 */
async function getLessonForCourse(courseId, lessonId) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: true },
  });
  if (!lesson || lesson.module.courseId !== courseId) {
    throw ApiError.notFound("Lesson not found for this course.");
  }
  return lesson;
}

async function createLesson(moduleId, data) {
  const mod = await moduleService.getModuleById(moduleId);

  let position = data.position;
  if (position === undefined) {
    const count = await prisma.lesson.count({ where: { moduleId } });
    position = count;
  }

  return prisma.lesson.create({
    data: {
      moduleId: mod.id,
      title: data.title,
      description: data.description,
      type: data.type || "TEXT",
      content: data.content,
      position,
      duration: data.duration,
      isPreview: Boolean(data.isPreview),
    },
  });
}

async function updateLesson(id, updates) {
  const lesson = await getLessonById(id);

  const data = {};
  if (updates.title !== undefined) data.title = updates.title;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.type !== undefined) data.type = updates.type;
  if (updates.content !== undefined) data.content = updates.content;
  if (updates.position !== undefined) data.position = updates.position;
  if (updates.duration !== undefined) data.duration = updates.duration;
  if (updates.isPreview !== undefined) data.isPreview = updates.isPreview;

  if (updates.moduleId !== undefined && updates.moduleId !== lesson.moduleId) {
    const targetModule = await moduleService.getModuleById(updates.moduleId);
    // Never allow a lesson to move to a module belonging to a different
    // course — that would silently reassign purchased content.
    if (targetModule.courseId !== lesson.module.courseId) {
      throw ApiError.badRequest("A lesson cannot be moved to a module in a different course.");
    }
    data.moduleId = updates.moduleId;
  }

  return prisma.lesson.update({ where: { id }, data });
}

async function deleteLesson(id) {
  const lesson = await getLessonById(id);

  await prisma.$transaction(async (tx) => {
    await tx.lessonProgress.deleteMany({ where: { lessonId: id } });
    await tx.fileAsset.deleteMany({ where: { lessonId: id } });
    await tx.lesson.delete({ where: { id } });
  });

  return lesson;
}

async function reorderLessons(moduleId, order) {
  await moduleService.getModuleById(moduleId);

  const lessons = await prisma.lesson.findMany({ where: { moduleId }, select: { id: true } });
  const validIds = new Set(lessons.map((l) => l.id));

  for (const item of order) {
    if (!validIds.has(item.id)) {
      throw ApiError.badRequest(`Lesson ${item.id} does not belong to this module.`);
    }
  }

  await prisma.$transaction(
    order.map((item) => prisma.lesson.update({ where: { id: item.id }, data: { position: item.position } }))
  );

  return prisma.lesson.findMany({ where: { moduleId }, orderBy: { position: "asc" } });
}

module.exports = {
  getLessonById,
  getLessonForCourse,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
};
