"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));

const courseService = require("../../src/services/course.service");

describe("course.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createCourse", () => {
    it("generates a unique slug from the title and stores the server-side price", async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null); // slug is free
      mockPrisma.course.create.mockResolvedValue({
        id: "course_1",
        title: "Ghostwriting Masterclass",
        slug: "ghostwriting-masterclass",
        price: 500,
        currency: "GHS",
        status: "DRAFT",
      });

      const course = await courseService.createCourse({
        title: "Ghostwriting Masterclass",
        price: 500,
      });

      expect(mockPrisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: "ghostwriting-masterclass",
            price: 500,
            status: "DRAFT",
          }),
        })
      );
      expect(course.slug).toBe("ghostwriting-masterclass");
    });

    it("appends a numeric suffix when the derived slug is already taken", async () => {
      mockPrisma.course.findUnique
        .mockResolvedValueOnce({ id: "existing", slug: "affiliate-marketing" }) // first candidate taken
        .mockResolvedValueOnce(null); // -2 candidate free
      mockPrisma.course.create.mockResolvedValue({
        id: "course_2",
        title: "Affiliate Marketing",
        slug: "affiliate-marketing-2",
        price: 300,
      });

      const course = await courseService.createCourse({ title: "Affiliate Marketing", price: 300 });

      expect(course.slug).toBe("affiliate-marketing-2");
    });

    it("rejects a categoryId that does not reference an existing category", async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(
        courseService.createCourse({ title: "X", price: 10, categoryId: "cat_missing" })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(mockPrisma.course.create).not.toHaveBeenCalled();
    });
  });

  describe("setCourseStatus", () => {
    it("refuses to publish a course without a valid price", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", price: null, status: "DRAFT" });

      await expect(courseService.setCourseStatus("c1", "PUBLISHED")).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.course.update).not.toHaveBeenCalled();
    });

    it("publishes a validly-priced course and stamps publishedAt", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", price: 500, status: "DRAFT", publishedAt: null });
      mockPrisma.course.update.mockResolvedValue({ id: "c1", status: "PUBLISHED", publishedAt: new Date() });

      const course = await courseService.setCourseStatus("c1", "PUBLISHED");

      expect(mockPrisma.course.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: expect.objectContaining({ status: "PUBLISHED", publishedAt: expect.any(Date) }),
      });
      expect(course.status).toBe("PUBLISHED");
    });
  });

  describe("listCourses", () => {
    it("only returns PUBLISHED courses for non-admin callers regardless of a requested status", async () => {
      mockPrisma.course.findMany.mockResolvedValue([]);
      mockPrisma.course.count.mockResolvedValue(0);

      await courseService.listCourses({ status: "DRAFT" }, { isAdmin: false });

      const callArgs = mockPrisma.course.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe("PUBLISHED");
    });

    it("honors the requested status for admin callers", async () => {
      mockPrisma.course.findMany.mockResolvedValue([]);
      mockPrisma.course.count.mockResolvedValue(0);

      await courseService.listCourses({ status: "DRAFT" }, { isAdmin: true });

      const callArgs = mockPrisma.course.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe("DRAFT");
    });
  });

  describe("getCourseBySlug", () => {
    it("returns 404 for a non-published course requested by a non-admin", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: "c1",
        slug: "draft-course",
        status: "DRAFT",
        modules: [],
      });

      await expect(courseService.getCourseBySlug("draft-course", { isAdmin: false })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("never includes lesson `content` in the syllabus shape", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: "c1",
        slug: "published-course",
        status: "PUBLISHED",
        modules: [
          {
            id: "m1",
            title: "Module 1",
            position: 0,
            lessons: [
              { id: "l1", title: "Lesson 1", type: "VIDEO", position: 0, duration: 60, isPreview: false, content: "secret-video-url" },
            ],
          },
        ],
      });
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } });

      const course = await courseService.getCourseBySlug("published-course", { isAdmin: false });

      expect(course.modules[0].lessons[0]).not.toHaveProperty("content");
    });
  });
});
