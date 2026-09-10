/**
 * Module (course section) business logic. Admin-only — see admin.routes.js.
 */
"use strict";

const { prisma } = require("../database/client");
const ApiError = require("../utils/ApiError");

async function assertCourseExists(courseId) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    throw ApiError.notFound("Course not found.");
  }
  return course;
}

async function getModuleById(id) {
  const mod = await prisma.module.findUnique({ where: { id } });
  if (!mod) {
    throw ApiError.notFound("Module not found.");
  }
  return mod;
}

async function listModulesForCourse(courseId) {
  return prisma.module.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    include: { lessons: { orderBy: { position: "asc" } } },
  });
}

async function createModule(courseId, data) {
  await assertCourseExists(courseId);

  let position = data.position;
  if (position === undefined) {
    const count = await prisma.module.count({ where: { courseId } });
    position = count;
  }

  return prisma.module.create({
    data: {
      courseId,
      title: data.title,
      description: data.description,
      position,
    },
  });
}

async function updateModule(id, updates) {
  await getModuleById(id);

  const data = {};
  if (updates.title !== undefined) data.title = updates.title;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.position !== undefined) data.position = updates.position;

  return prisma.module.update({ where: { id }, data });
}

/**
 * Deletes a module along with its lessons and any progress/file records
 * attached to them, inside a transaction, so a course never ends up with
 * orphaned lessons pointing at a missing module.
 */
async function deleteModule(id) {
  const mod = await getModuleById(id);

  await prisma.$transaction(async (tx) => {
    const lessons = await tx.lesson.findMany({ where: { moduleId: id }, select: { id: true } });
    const lessonIds = lessons.map((l) => l.id);

    if (lessonIds.length) {
      await tx.lessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await tx.fileAsset.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } });
    }

    await tx.module.delete({ where: { id } });
  });

  return mod;
}

async function reorderModules(courseId, order) {
  await assertCourseExists(courseId);

  const modules = await prisma.module.findMany({ where: { courseId }, select: { id: true } });
  const validIds = new Set(modules.map((m) => m.id));

  for (const item of order) {
    if (!validIds.has(item.id)) {
      throw ApiError.badRequest(`Module ${item.id} does not belong to this course.`);
    }
  }

  await prisma.$transaction(
    order.map((item) => prisma.module.update({ where: { id: item.id }, data: { position: item.position } }))
  );

  return listModulesForCourse(courseId);
}

module.exports = {
  assertCourseExists,
  getModuleById,
  listModulesForCourse,
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
};
