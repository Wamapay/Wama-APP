"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/services/courseAccess.service", () => ({
  hasCourseAccess: jest.fn(),
}));

const progressService = require("../../src/services/progress.service");
const courseAccessService = require("../../src/services/courseAccess.service");

describe("progress.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("markLessonComplete", () => {
    it("refuses to mark progress for a user without course access", async () => {
      courseAccessService.hasCourseAccess.mockResolvedValue(false);

      await expect(progressService.markLessonComplete("user_1", "course_1", "lesson_1")).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(mockPrisma.lessonProgress.upsert).not.toHaveBeenCalled();
    });

    it("404s when the lesson does not belong to the given course", async () => {
      courseAccessService.hasCourseAccess.mockResolvedValue(true);
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: "lesson_1",
        module: { courseId: "OTHER_COURSE" },
      });

      await expect(progressService.markLessonComplete("user_1", "course_1", "lesson_1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("marks the enrollment COMPLETED once every lesson is completed", async () => {
      courseAccessService.hasCourseAccess.mockResolvedValue(true);
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: "lesson_2", module: { courseId: "course_1" } });
      mockPrisma.lessonProgress.upsert.mockResolvedValue({});
      mockPrisma.enrollment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.lesson.count.mockResolvedValue(2); // total lessons in course
      mockPrisma.lessonProgress.count.mockResolvedValue(2); // now both completed
      mockPrisma.lessonProgress.findFirst.mockResolvedValue(null);
      mockPrisma.enrollment.findUnique.mockResolvedValue({ status: "ACTIVE", completedAt: null });

      await progressService.markLessonComplete("user_1", "course_1", "lesson_2");

      const completionCall = mockPrisma.enrollment.updateMany.mock.calls.find(
        (call) => call[0].data && call[0].data.status === "COMPLETED"
      );
      expect(completionCall).toBeTruthy();
      expect(completionCall[0].where).toEqual(
        expect.objectContaining({ userId: "user_1", courseId: "course_1", status: { not: "COMPLETED" } })
      );
    });

    it("does NOT mark the course complete when lessons remain", async () => {
      courseAccessService.hasCourseAccess.mockResolvedValue(true);
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: "lesson_1", module: { courseId: "course_1" } });
      mockPrisma.lessonProgress.upsert.mockResolvedValue({});
      mockPrisma.lesson.count.mockResolvedValue(10);
      mockPrisma.lessonProgress.count.mockResolvedValue(8);
      mockPrisma.lessonProgress.findFirst.mockResolvedValue(null);
      mockPrisma.enrollment.findUnique.mockResolvedValue({ status: "ACTIVE", completedAt: null });

      await progressService.markLessonComplete("user_1", "course_1", "lesson_1");

      const completionCall = mockPrisma.enrollment.updateMany.mock.calls.find(
        (call) => call[0].data && call[0].data.status === "COMPLETED"
      );
      expect(completionCall).toBeUndefined();
    });
  });

  describe("getCourseProgress", () => {
    it("refuses to report progress for a user with no enrollment at all", async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);

      await expect(progressService.getCourseProgress("user_1", "course_1")).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("computes an 80% completion percentage for 8/10 completed lessons", async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ status: "ACTIVE", completedAt: null });
      mockPrisma.lesson.count.mockResolvedValue(10);
      mockPrisma.lessonProgress.count.mockResolvedValue(8);
      mockPrisma.lessonProgress.findFirst.mockResolvedValue(null);

      const summary = await progressService.getCourseProgress("user_1", "course_1");

      expect(summary.totalLessons).toBe(10);
      expect(summary.completedLessons).toBe(8);
      expect(summary.progressPercentage).toBe(80);
    });
  });
});
