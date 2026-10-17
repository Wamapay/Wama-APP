"use strict";

const { createPrismaMock, withDefaultTransaction } = require("../helpers/mockPrisma");

const mockPrisma = withDefaultTransaction(createPrismaMock());
jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/services/agent.service", () => ({ updateAgentVerification: jest.fn(), createAgentForUser: jest.fn() }));
jest.mock("../../src/services/reward.service", () => ({ evaluateReferralRewards: jest.fn() }));

const creatorService = require("../../src/services/creator.service");
const pipeline = require("../../src/services/financialPipeline.service");
const requireCreator = require("../../src/middleware/requireCreator");

function ledgerMocks() {
  mockPrisma.transaction.findFirst.mockResolvedValue(null);
  mockPrisma.transaction.count.mockResolvedValue(0);
  mockPrisma.transaction.create.mockImplementation(({ data }) => Promise.resolve({ id: "t", ...data }));
  mockPrisma.user.update.mockResolvedValue({});
}

describe("creator store", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withDefaultTransaction(mockPrisma);
  });

  describe("ownership", () => {
    it("lets a creator open their own product", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", creatorId: "cr1" });
      await expect(creatorService.getOwnedCourse("cr1", "c1")).resolves.toMatchObject({ id: "c1" });
    });

    it("returns 404 for another creator's product (same as not found)", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", creatorId: "someone_else" });
      await expect(creatorService.getOwnedCourse("cr1", "c1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("returns 404 for a platform (admin) course", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", creatorId: null });
      await expect(creatorService.getOwnedCourse("cr1", "c1")).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("publishing rules", () => {
    it("never lets a creator re-publish a product that isn't approved", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", creatorId: "cr1", approvalStatus: "PENDING" });
      await expect(creatorService.republishMine("cr1", "c1")).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.course.update).not.toHaveBeenCalled();
    });

    it("requires a lesson, description and cover before submitting for review", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", creatorId: "cr1", status: "DRAFT" });
      mockPrisma.lesson.count.mockResolvedValue(0);
      await expect(creatorService.submitForReview("cr1", "c1")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("submits a complete product as PENDING", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", creatorId: "cr1", status: "DRAFT", description: "d", thumbnail: "https://x/y.png" });
      mockPrisma.lesson.count.mockResolvedValue(2);
      mockPrisma.course.update.mockResolvedValue({ id: "c1", approvalStatus: "PENDING" });
      await creatorService.submitForReview("cr1", "c1");
      expect(mockPrisma.course.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ approvalStatus: "PENDING" }) }));
    });

    it("strips status/featured/approval fields from creator updates", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", creatorId: "cr1" });
      mockPrisma.course.update.mockResolvedValue({ id: "c1" });
      await creatorService.updateMyCourse("cr1", "c1", { title: "New", status: "PUBLISHED", featured: true, approvalStatus: "APPROVED" });
      const data = mockPrisma.course.update.mock.calls[0][0].data;
      expect(data).toEqual({ title: "New" });
    });
  });

  describe("earnings pipeline", () => {
    const order = { id: "o1", orderNumber: "ORD-1", userId: "buyer", courseId: "c1", amount: 500, currency: "GHS", agentId: null, referralCode: null };

    it("pays the creator sale minus the 20% platform fee, with no cashback or commission", async () => {
      ledgerMocks();
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", title: "My Course", creatorId: "cr1" });
      const result = await pipeline.runPurchaseFinancialPipeline(order);
      const created = mockPrisma.transaction.create.mock.calls.map(([{ data }]) => data);
      const sale = created.find((t) => t.type === "CREATOR_SALE");
      expect(sale.userId).toBe("cr1");
      expect(sale.amount.toString()).toBe("400");
      expect(sale.balanceType).toBe("EARNINGS");
      expect(created.find((t) => t.type === "CASHBACK")).toBeUndefined();
      expect(created.find((t) => t.type === "COMMISSION")).toBeUndefined();
      expect(result.commission.referral).toBeNull();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "cr1" }, data: { earningsBalance: { increment: expect.anything() } } });
    });

    it("still gives cashback on a normal (platform) course", async () => {
      ledgerMocks();
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", title: "Platform", creatorId: null });
      mockPrisma.referral.findUnique.mockResolvedValue(null);
      await pipeline.runPurchaseFinancialPipeline(order);
      const created = mockPrisma.transaction.create.mock.calls.map(([{ data }]) => data);
      expect(created.find((t) => t.type === "CASHBACK")).toBeDefined();
      expect(created.find((t) => t.type === "CREATOR_SALE")).toBeUndefined();
    });
  });

  describe("requireCreator middleware", () => {
    const run = async (dbUser) => {
      mockPrisma.user.findUnique.mockResolvedValue(dbUser);
      const next = jest.fn();
      await requireCreator({ user: { id: "u1" } }, {}, next);
      return next.mock.calls[0][0];
    };
    it("allows CREATOR accounts", async () => {
      expect(await run({ id: "u1", accountType: "CREATOR" })).toBeUndefined();
    });
    it("blocks normal accounts with 403", async () => {
      expect(await run({ id: "u1", accountType: "NORMAL" })).toMatchObject({ statusCode: 403 });
    });
  });
});
