"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));

const { hasCourseAccess } = require("../../src/services/courseAccess.service");

describe("courseAccess.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("denies access for an unauthenticated caller", async () => {
    const result = await hasCourseAccess(null, "course_1");
    expect(result).toBe(false);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("grants access to ADMIN and SUPER_ADMIN regardless of enrollment", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });

    const result = await hasCourseAccess("admin_1", "course_1");

    expect(result).toBe(true);
    expect(mockPrisma.enrollment.findUnique).not.toHaveBeenCalled();
  });

  it("denies access when there is no enrollment (never purchased)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.enrollment.findUnique.mockResolvedValue(null);

    const result = await hasCourseAccess("user_1", "course_1");
    expect(result).toBe(false);
  });

  it("grants access for an ACTIVE enrollment", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.enrollment.findUnique.mockResolvedValue({ status: "ACTIVE" });

    const result = await hasCourseAccess("user_1", "course_1");
    expect(result).toBe(true);
  });

  it("grants access for a COMPLETED enrollment", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.enrollment.findUnique.mockResolvedValue({ status: "COMPLETED" });

    const result = await hasCourseAccess("user_1", "course_1");
    expect(result).toBe(true);
  });

  it("denies access for a SUSPENDED enrollment", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.enrollment.findUnique.mockResolvedValue({ status: "SUSPENDED" });

    const result = await hasCourseAccess("user_1", "course_1");
    expect(result).toBe(false);
  });
});
