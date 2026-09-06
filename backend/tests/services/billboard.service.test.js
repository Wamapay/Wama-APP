"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/services/order.service", () => ({
  listRecentPurchaseActivity: jest.fn(),
}));

const billboardService = require("../../src/services/billboard.service");
const orderService = require("../../src/services/order.service");

describe("billboard.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createFeaturedEntry", () => {
    it("requires a name", async () => {
      await expect(
        billboardService.createFeaturedEntry({ adminId: "admin_1", name: "", message: "Hi", durationDays: 7 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("requires a message", async () => {
      await expect(
        billboardService.createFeaturedEntry({ adminId: "admin_1", name: "Ama", message: "", durationDays: 7 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a message over the max length", async () => {
      await expect(
        billboardService.createFeaturedEntry({ adminId: "admin_1", name: "Ama", message: "x".repeat(301), durationDays: 7 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a non-positive duration", async () => {
      await expect(
        billboardService.createFeaturedEntry({ adminId: "admin_1", name: "Ama", message: "Hi", durationDays: 0 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a duration beyond the max allowed", async () => {
      await expect(
        billboardService.createFeaturedEntry({ adminId: "admin_1", name: "Ama", message: "Hi", durationDays: 9999 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("creates a real entry with a correctly computed displayUntil and the real admin identity recorded", async () => {
      mockPrisma.featuredBillboardEntry.create.mockImplementation(({ data }) => Promise.resolve({ id: "feat_1", ...data }));
      const before = Date.now();

      const entry = await billboardService.createFeaturedEntry({
        adminId: "admin_1", name: "Ama Serwaa", imageUrl: "https://cdn.example.com/ama.jpg", message: "Top earner this month!", durationDays: 7,
      });

      expect(entry.createdByAdminId).toBe("admin_1");
      expect(entry.name).toBe("Ama Serwaa");
      const expectedMs = 7 * 24 * 60 * 60 * 1000;
      expect(entry.displayUntil.getTime() - before).toBeGreaterThan(expectedMs - 1000);
      expect(entry.displayUntil.getTime() - before).toBeLessThan(expectedMs + 5000);
    });

    it("allows a null imageUrl — a featured entry doesn't require a photo", async () => {
      mockPrisma.featuredBillboardEntry.create.mockImplementation(({ data }) => Promise.resolve({ id: "feat_1", ...data }));
      const entry = await billboardService.createFeaturedEntry({
        adminId: "admin_1", name: "Ama", message: "Congrats!", durationDays: 3,
      });
      expect(entry.imageUrl).toBeNull();
    });
  });

  describe("deleteFeaturedEntry", () => {
    it("404s for an entry that doesn't exist", async () => {
      mockPrisma.featuredBillboardEntry.findUnique.mockResolvedValue(null);
      await expect(billboardService.deleteFeaturedEntry("ghost")).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.featuredBillboardEntry.delete).not.toHaveBeenCalled();
    });

    it("deletes a real entry — lets an admin remove one early, before it expires", async () => {
      mockPrisma.featuredBillboardEntry.findUnique.mockResolvedValue({ id: "feat_1" });
      mockPrisma.featuredBillboardEntry.delete.mockResolvedValue({});
      await billboardService.deleteFeaturedEntry("feat_1");
      expect(mockPrisma.featuredBillboardEntry.delete).toHaveBeenCalledWith({ where: { id: "feat_1" } });
    });
  });

  describe("listBillboardActivity — the combined public feed", () => {
    it("only includes NOT-YET-expired featured entries, real purchases regardless", async () => {
      mockPrisma.featuredBillboardEntry.findMany.mockResolvedValue([
        { id: "feat_1", name: "Ama", imageUrl: "https://x.com/a.jpg", message: "Great work!", createdAt: new Date() },
      ]);
      orderService.listRecentPurchaseActivity.mockResolvedValue([
        { buyerName: "Kojo B.", courseTitle: "Crypto Basics", cashbackAmount: 50, purchasedAt: new Date() },
      ]);

      const result = await billboardService.listBillboardActivity();

      expect(mockPrisma.featuredBillboardEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { displayUntil: { gt: expect.any(Date) } } })
      );
      expect(result).toHaveLength(2);
    });

    it("tags entries with the correct type so the frontend can render each shape correctly", async () => {
      mockPrisma.featuredBillboardEntry.findMany.mockResolvedValue([
        { id: "feat_1", name: "Ama", imageUrl: "https://x.com/a.jpg", message: "Great work!", createdAt: new Date() },
      ]);
      orderService.listRecentPurchaseActivity.mockResolvedValue([
        { buyerName: "Kojo B.", courseTitle: "Crypto Basics", cashbackAmount: 50, purchasedAt: new Date() },
      ]);

      const result = await billboardService.listBillboardActivity();

      expect(result[0]).toMatchObject({ type: "featured", name: "Ama", message: "Great work!" });
      expect(result[1]).toMatchObject({ type: "purchase", buyerName: "Kojo B.", courseTitle: "Crypto Basics" });
    });

    it("featured entries are shown BEFORE automatic purchase activity", async () => {
      mockPrisma.featuredBillboardEntry.findMany.mockResolvedValue([
        { id: "feat_1", name: "Featured Person", imageUrl: null, message: "Spotlight!", createdAt: new Date() },
      ]);
      orderService.listRecentPurchaseActivity.mockResolvedValue([
        { buyerName: "Real Buyer", courseTitle: "Course", cashbackAmount: 10, purchasedAt: new Date() },
      ]);

      const result = await billboardService.listBillboardActivity();
      expect(result[0].type).toBe("featured");
      expect(result[1].type).toBe("purchase");
    });

    it("works correctly with zero featured entries — just the real activity, nothing fabricated", async () => {
      mockPrisma.featuredBillboardEntry.findMany.mockResolvedValue([]);
      orderService.listRecentPurchaseActivity.mockResolvedValue([]);
      const result = await billboardService.listBillboardActivity();
      expect(result).toEqual([]);
    });
  });
});
