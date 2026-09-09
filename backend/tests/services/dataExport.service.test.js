"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/services/email.service", () => ({
  sendDataExportEmail: jest.fn(),
}));

const dataExportService = require("../../src/services/dataExport.service");
const emailService = require("../../src/services/email.service");

describe("dataExport.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("compileUserDataCsv", () => {
    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(dataExportService.compileUserDataCsv("ghost")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("includes real profile fields", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        fullName: "Ama Serwaa", email: "ama@example.com", phone: "+233240000000",
        role: "USER", emailVerified: true, createdAt: new Date("2026-01-01"),
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const csv = await dataExportService.compileUserDataCsv("user_1");

      expect(csv).toContain("=== PROFILE ===");
      expect(csv).toContain("Ama Serwaa");
      expect(csv).toContain("ama@example.com");
    });

    it("includes real order data, with the real course title", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        fullName: "Ama", email: "ama@example.com", phone: "", role: "USER", emailVerified: true, createdAt: new Date(),
      });
      mockPrisma.order.findMany.mockResolvedValue([
        { orderNumber: "ORD-1", course: { title: "Forex Masterclass" }, amount: 400, currency: "GHS", status: "PAID", createdAt: new Date("2026-02-01") },
      ]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const csv = await dataExportService.compileUserDataCsv("user_1");

      expect(csv).toContain("=== ORDERS ===");
      expect(csv).toContain("ORD-1");
      expect(csv).toContain("Forex Masterclass");
      expect(csv).toContain("400");
    });

    it("includes real transaction data", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        fullName: "Ama", email: "ama@example.com", phone: "", role: "USER", emailVerified: true, createdAt: new Date(),
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([
        { transactionId: "TXN-1", type: "CASHBACK", amount: 80, currency: "GHS", status: "SUCCESSFUL", description: "Cashback for order", createdAt: new Date() },
      ]);

      const csv = await dataExportService.compileUserDataCsv("user_1");

      expect(csv).toContain("=== TRANSACTIONS ===");
      expect(csv).toContain("TXN-1");
      expect(csv).toContain("CASHBACK");
    });

    it("correctly escapes a value containing a comma, so the CSV stays valid", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        fullName: "Ama", email: "ama@example.com", phone: "", role: "USER", emailVerified: true, createdAt: new Date(),
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([
        { transactionId: "TXN-1", type: "CASHBACK", amount: 80, currency: "GHS", status: "SUCCESSFUL", description: "Cashback, for order #123", createdAt: new Date() },
      ]);

      const csv = await dataExportService.compileUserDataCsv("user_1");
      expect(csv).toContain('"Cashback, for order #123"');
    });
  });

  describe("requestDataExport", () => {
    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(dataExportService.requestDataExport("ghost")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("sends a real email with the real compiled CSV to the user's real address", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1", fullName: "Ama Serwaa", email: "ama@example.com", phone: "", role: "USER", emailVerified: true, createdAt: new Date(),
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      emailService.sendDataExportEmail.mockResolvedValue({ sent: true });

      const result = await dataExportService.requestDataExport("user_1");

      expect(emailService.sendDataExportEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "ama@example.com", fullName: "Ama Serwaa", csv: expect.stringContaining("PROFILE") })
      );
      expect(result.sent).toBe(true);
    });

    it("reports a failed send rather than throwing — the caller decides what that means", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1", fullName: "Ama", email: "ama@example.com", phone: "", role: "USER", emailVerified: true, createdAt: new Date(),
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      emailService.sendDataExportEmail.mockResolvedValue({ sent: false });

      const result = await dataExportService.requestDataExport("user_1");
      expect(result.sent).toBe(false);
    });
  });
});
