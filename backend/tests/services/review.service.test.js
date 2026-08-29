"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/services/courseAccess.service", () => ({
  hasCourseAccess: jest.fn(),
}));

const reviewService = require("../../src/services/review.service");
const courseAccessService = require("../../src/services/courseAccess.service");

describe("review.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("upsertReview — eligibility", () => {
    it("rejects a review from a user who has not purchased the course", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "course_1" });
      courseAccessService.hasCourseAccess.mockResolvedValue(false);

      await expect(
        reviewService.upsertReview("user_1", "course_1", { rating: 5 })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.review.upsert).not.toHaveBeenCalled();
    });

    it("404s for a non-existent course", async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);

      await expect(
        reviewService.upsertReview("user_1", "missing", { rating: 5 })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("allows a user with course access to create a review", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "course_1" });
      courseAccessService.hasCourseAccess.mockResolvedValue(true);
      mockPrisma.review.findUnique.mockResolvedValue(null);
      mockPrisma.review.upsert.mockResolvedValue({ id: "rev_1", rating: 5, status: "PUBLISHED" });

      const review = await reviewService.upsertReview("user_1", "course_1", { rating: 5, comment: "Great!" });

      expect(mockPrisma.review.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_courseId: { userId: "user_1", courseId: "course_1" } },
          create: expect.objectContaining({ status: "PUBLISHED" }),
        })
      );
      expect(review.id).toBe("rev_1");
    });

    it("updates the existing review instead of creating a duplicate on a second submission", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "course_1" });
      courseAccessService.hasCourseAccess.mockResolvedValue(true);
      mockPrisma.review.findUnique.mockResolvedValue({ id: "rev_1", status: "HIDDEN" });
      mockPrisma.review.upsert.mockResolvedValue({ id: "rev_1", rating: 4, status: "HIDDEN" });

      await reviewService.upsertReview("user_1", "course_1", { rating: 4 });

      const call = mockPrisma.review.upsert.mock.calls[0][0];
      // Editing content must not silently un-hide a review an Admin moderated.
      expect(call.create.status).toBe("HIDDEN");
      expect(call.update).toEqual(expect.objectContaining({ rating: 4 }));
    });
  });

  describe("listReviewsForCourse", () => {
    it("only returns PUBLISHED reviews for non-admin callers", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "course_1" });
      mockPrisma.review.findMany.mockResolvedValue([]);
      mockPrisma.review.count.mockResolvedValue(0);

      await reviewService.listReviewsForCourse("course_1", { isAdmin: false });

      const callArgs = mockPrisma.review.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe("PUBLISHED");
    });
  });
});
