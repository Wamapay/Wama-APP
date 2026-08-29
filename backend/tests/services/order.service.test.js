"use strict";

const { createPrismaMock, withDefaultTransaction } = require("../helpers/mockPrisma");

const mockPrisma = withDefaultTransaction(createPrismaMock());

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/services/agent.service", () => ({
  createAgentForUser: jest.fn().mockResolvedValue({ id: "agent_1" }),
}));
jest.mock("../../src/services/financialPipeline.service", () => ({
  runPurchaseFinancialPipeline: jest.fn().mockResolvedValue({ alreadyProcessed: false }),
}));

const orderService = require("../../src/services/order.service");
const agentService = require("../../src/services/agent.service");
const financialPipelineService = require("../../src/services/financialPipeline.service");

describe("order.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withDefaultTransaction(mockPrisma);
  });

  describe("createOrder — server-side price protection", () => {
    // MANDATORY TEST (Backend Stage 3, checklist item 64): a manipulated
    // client-supplied amount must NEVER be used — only Course.price from
    // the database.
    it("uses the database course price, ignoring any amount the client might try to imply", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: "course_1",
        status: "PUBLISHED",
        price: 500, // database price = GH₵500
        currency: "GHS",
      });
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.create.mockImplementation(({ data }) => Promise.resolve({ id: "order_1", ...data }));

      // The createOrder() service signature only accepts courseId/referralCode
      // in the first place — there is no `amount` parameter to even smuggle
      // a manipulated price through.
      const order = await orderService.createOrder({ userId: "user_1", courseId: "course_1" });

      expect(order.amount).toBe(500);
      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: 500, currency: "GHS" }) })
      );
    });

    it("rejects an order for a course that is not PUBLISHED", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", status: "DRAFT", price: 100 });

      await expect(orderService.createOrder({ userId: "u1", courseId: "c1" })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it("rejects an order for a course with no valid price", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", status: "PUBLISHED", price: 0 });

      await expect(orderService.createOrder({ userId: "u1", courseId: "c1" })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("404s for a non-existent course", async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);

      await expect(orderService.createOrder({ userId: "u1", courseId: "missing" })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("generates a human-readable, date-stamped order number", async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: "c1", status: "PUBLISHED", price: 250, currency: "GHS" });
      mockPrisma.order.count.mockResolvedValue(4);
      mockPrisma.order.create.mockImplementation(({ data }) => Promise.resolve({ id: "order_x", ...data }));

      const order = await orderService.createOrder({ userId: "u1", courseId: "c1" });

      expect(order.orderNumber).toMatch(/^ORD-\d{8}-\d{6}$/);
    });
  });

  describe("handleSuccessfulPurchase", () => {
    it("marks the order PAID, creates an enrollment, and triggers Agent creation", async () => {
      mockPrisma.order.findUnique
        .mockResolvedValueOnce({ id: "order_1", status: "PENDING", userId: "user_1", courseId: "course_1" })
        .mockResolvedValueOnce({ id: "order_1", status: "PAID", enrollment: { id: "enr_1" } });
      mockPrisma.order.update.mockResolvedValue({
        id: "order_1",
        status: "PAID",
        paymentStatus: "SUCCESSFUL",
        userId: "user_1",
        courseId: "course_1",
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      mockPrisma.enrollment.create.mockResolvedValue({ id: "enr_1", status: "ACTIVE" });

      const result = await orderService.handleSuccessfulPurchase("order_1");

      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order_1" },
          data: expect.objectContaining({ status: "PAID", paymentStatus: "SUCCESSFUL" }),
        })
      );
      expect(mockPrisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: "user_1", courseId: "course_1" }) })
      );
      expect(agentService.createAgentForUser).toHaveBeenCalledWith("user_1");
      expect(financialPipelineService.runPurchaseFinancialPipeline).toHaveBeenCalledWith(
        expect.objectContaining({ id: "order_1" })
      );
      expect(result.status).toBe("PAID");
    });

    it("is idempotent: calling it again on an already-PAID order does not reprocess it", async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({ id: "order_1", status: "PAID" });
      mockPrisma.order.findUnique.mockResolvedValueOnce({ id: "order_1", status: "PAID", enrollment: { id: "enr_1" } });

      await orderService.handleSuccessfulPurchase("order_1");

      expect(mockPrisma.order.update).not.toHaveBeenCalled();
      expect(mockPrisma.enrollment.create).not.toHaveBeenCalled();
      expect(agentService.createAgentForUser).not.toHaveBeenCalled();
      expect(financialPipelineService.runPurchaseFinancialPipeline).not.toHaveBeenCalled();
    });
  });

  describe("purchase finality — no refund/cancellation path", () => {
    it("markOrderFailed refuses to touch a PAID order (no cancellation-after-success)", async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: "order_1", status: "PAID" });

      await expect(orderService.markOrderFailed("order_1")).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });

    it("order.service.js exposes no refund function of any kind", () => {
      const exported = Object.keys(orderService).join(",").toLowerCase();
      expect(exported).not.toMatch(/refund/);
      expect(exported).not.toMatch(/cancel/);
    });
  });

  describe("ownership", () => {
    it("getOrderById hides another user's order behind a 404 (not 403)", async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: "order_1", userId: "owner_1" });

      await expect(
        orderService.getOrderById("order_1", { userId: "someone_else", isAdmin: false })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("allows an Admin to view any order", async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: "order_1", userId: "owner_1" });

      const order = await orderService.getOrderById("order_1", { isAdmin: true });
      expect(order.id).toBe("order_1");
    });
  });
});
