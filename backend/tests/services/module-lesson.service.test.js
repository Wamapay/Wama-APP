"use strict";

const { createPrismaMock, withDefaultTransaction } = require("../helpers/mockPrisma");

const mockPrisma = withDefaultTransaction(createPrismaMock());

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));

const moduleService = require("../../src/services/module.service");
const lessonService = require("../../src/services/lesson.service");

describe("module.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withDefaultTransaction(mockPrisma);
  });

  it("creates a module with an auto-assigned position when none is given", async () => {
    mockPrisma.course.findUnique.mockResolvedValue({ id: "course_1" });
    mockPrisma.module.count.mockResolvedValue(2);
    mockPrisma.module.create.mockImplementation(({ data }) => Promise.resolve({ id: "mod_3", ...data }));

    const mod = await moduleService.createModule("course_1", { title: "Module 3" });

    expect(mod.position).toBe(2);
  });

  it("reorderModules rejects a module id that does not belong to the course", async () => {
    mockPrisma.course.findUnique.mockResolvedValue({ id: "course_1" });
    mockPrisma.module.findMany.mockResolvedValue([{ id: "mod_1" }]);

    await expect(
      moduleService.reorderModules("course_1", [{ id: "mod_from_other_course", position: 0 }])
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("deleteModule removes lessons, their progress, and file assets in a transaction", async () => {
    mockPrisma.module.findUnique.mockResolvedValue({ id: "mod_1", courseId: "course_1" });
    mockPrisma.lesson.findMany.mockResolvedValue([{ id: "lesson_1" }, { id: "lesson_2" }]);
    mockPrisma.lessonProgress.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.fileAsset.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.lesson.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.module.delete.mockResolvedValue({ id: "mod_1" });

    await moduleService.deleteModule("mod_1");

    expect(mockPrisma.lessonProgress.deleteMany).toHaveBeenCalledWith({
      where: { lessonId: { in: ["lesson_1", "lesson_2"] } },
    });
    expect(mockPrisma.lesson.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["lesson_1", "lesson_2"] } },
    });
    expect(mockPrisma.module.delete).toHaveBeenCalledWith({ where: { id: "mod_1" } });
  });
});

describe("lesson.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withDefaultTransaction(mockPrisma);
  });

  describe("getLessonForCourse — content isolation", () => {
    it("404s when the lesson belongs to a different course", async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: "lesson_1",
        module: { id: "mod_1", courseId: "course_B" },
      });

      await expect(lessonService.getLessonForCourse("course_A", "lesson_1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("returns the lesson when it does belong to the given course", async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: "lesson_1",
        module: { id: "mod_1", courseId: "course_A" },
      });

      const lesson = await lessonService.getLessonForCourse("course_A", "lesson_1");
      expect(lesson.id).toBe("lesson_1");
    });
  });

  describe("updateLesson — cross-course move protection", () => {
    it("refuses to move a lesson into a module belonging to a different course", async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: "lesson_1",
        moduleId: "mod_A",
        module: { id: "mod_A", courseId: "course_A" },
      });
      mockPrisma.module.findUnique.mockResolvedValue({ id: "mod_B", courseId: "course_B" });

      await expect(lessonService.updateLesson("lesson_1", { moduleId: "mod_B" })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.lesson.update).not.toHaveBeenCalled();
    });

    it("allows moving a lesson between modules within the SAME course", async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: "lesson_1",
        moduleId: "mod_A",
        module: { id: "mod_A", courseId: "course_A" },
      });
      mockPrisma.module.findUnique.mockResolvedValue({ id: "mod_A2", courseId: "course_A" });
      mockPrisma.lesson.update.mockResolvedValue({ id: "lesson_1", moduleId: "mod_A2" });

      const lesson = await lessonService.updateLesson("lesson_1", { moduleId: "mod_A2" });
      expect(lesson.moduleId).toBe("mod_A2");
    });
  });

  it("rejects reordering lessons using an id that does not belong to the module", async () => {
    mockPrisma.module.findUnique.mockResolvedValue({ id: "mod_1" });
    mockPrisma.lesson.findMany.mockResolvedValue([{ id: "lesson_1" }]);

    await expect(
      lessonService.reorderLessons("mod_1", [{ id: "lesson_from_elsewhere", position: 0 }])
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
