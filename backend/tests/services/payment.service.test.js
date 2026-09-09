"use strict";

const crypto = require("crypto");
const { createPrismaMock, withDefaultTransaction } = require("../helpers/mockPrisma");

const mockPrisma = withDefaultTransaction(createPrismaMock());
const TEST_SECRET = "sk_test_secret_key";

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));

jest.mock("../../src/config/env", () => ({
  config: {
    isProduction: false,
    isDevelopment: false,
    isTest: true,
    logging: { level: "error" },
    paystack: {
      secretKey: "sk_test_secret_key",
      publicKey: "pk_test",
      baseUrl: "https://api.paystack.co",
      callbackUrl: "https://frontend.example.com/callback",
      requestTimeoutMs: 15000,
    },
  },
}));

jest.mock("../../src/services/paystack.service", () => ({
  initializeTransaction: jest.fn(),
  verifyTransaction: jest.fn(),
}));

jest.mock("../../src/services/order.service", () => ({
  handleSuccessfulPurchase: jest.fn(),
}));

const paymentService = require("../../src/services/payment.service");
const paystackService = require("../../src/services/paystack.service");
const orderService = require("../../src/services/order.service");

function baseOrder(overrides = {}) {
  return {
    id: "order_1",
    orderNumber: "ORD-20260823-000001",
    userId: "buyer_1",
    courseId: "course_1",
    amount: 500,
    currency: "GHS",
    status: "PENDING",
    paymentReference: null,
    ...overrides,
  };
}

function sign(rawBodyString) {
  return crypto.createHmac("sha512", TEST_SECRET).update(Buffer.from(rawBodyString)).digest("hex");
}

describe("payment.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withDefaultTransaction(mockPrisma);
  });

  describe("initializePayment — server-side price + ownership protection", () => {
    it("uses the order's DB amount/currency (never a client-supplied value) to init with Paystack", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder());
      mockPrisma.payment.count.mockResolvedValue(0);
      mockPrisma.payment.findUnique.mockResolvedValue(null); // reference collision check
      mockPrisma.payment.create.mockImplementation(({ data }) => Promise.resolve({ id: "pay_1", ...data }));
      mockPrisma.order.update.mockResolvedValue({});
      paystackService.initializeTransaction.mockResolvedValue({
        authorization_url: "https://checkout.paystack.com/abc123",
        access_code: "abc123",
        reference: "PAY-20260823-000001",
      });

      const result = await paymentService.initializePayment({
        orderId: "order_1",
        userId: "buyer_1",
        userEmail: "buyer@example.com",
      });

      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "buyer@example.com",
          amountSubunit: 50000, // GHS 500.00 -> 50000 pesewas, never trusted from the client
          currency: "GHS",
        })
      );
      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: 500, currency: "GHS", orderId: "order_1" }) })
      );
      expect(result.authorizationUrl).toBe("https://checkout.paystack.com/abc123");
    });

    it("returns 403 Forbidden when the order belongs to a different user", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder({ userId: "someone_else" }));

      await expect(
        paymentService.initializePayment({ orderId: "order_1", userId: "buyer_1", userEmail: "buyer@example.com" })
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(paystackService.initializeTransaction).not.toHaveBeenCalled();
    });

    it("404s for a non-existent order", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(
        paymentService.initializePayment({ orderId: "missing", userId: "buyer_1", userEmail: "buyer@example.com" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects initializing payment for an order that is already PAID", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder({ status: "PAID" }));

      await expect(
        paymentService.initializePayment({ orderId: "order_1", userId: "buyer_1", userEmail: "buyer@example.com" })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(paystackService.initializeTransaction).not.toHaveBeenCalled();
    });
  });

  describe("verifyPayment — independent verification, never trusting the frontend", () => {
    function basePayment(overrides = {}) {
      return {
        id: "pay_1",
        orderId: "order_1",
        userId: "buyer_1",
        providerReference: "PAY-20260823-000001",
        amount: 500,
        currency: "GHS",
        status: "INITIALIZED",
        ...overrides,
      };
    }

    it("404s for an unknown payment reference and creates no records", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      await expect(paymentService.verifyPayment({ reference: "UNKNOWN", userId: "buyer_1" })).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(paystackService.verifyTransaction).not.toHaveBeenCalled();
      expect(orderService.handleSuccessfulPurchase).not.toHaveBeenCalled();
    });

    it("404s (not 200) when a user tries to verify someone else's payment", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(basePayment({ userId: "someone_else" }));

      await expect(
        paymentService.verifyPayment({ reference: "PAY-20260823-000001", userId: "buyer_1" })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(paystackService.verifyTransaction).not.toHaveBeenCalled();
    });

    it("marks the payment SUCCESSFUL and runs the existing Stage 4 pipeline when amount + currency match", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(basePayment());
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder());
      mockPrisma.payment.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...basePayment(), ...data })
      );
      paystackService.verifyTransaction.mockResolvedValue({
        status: "success",
        amount: 50000, // pesewas -> GHS 500.00, matches the order exactly
        currency: "GHS",
        channel: "card",
        gateway_response: "Successful",
        paid_at: "2026-08-23T10:00:00.000Z",
        id: 123456,
      });
      orderService.handleSuccessfulPurchase.mockResolvedValue({ id: "order_1", status: "PAID" });

      const result = await paymentService.verifyPayment({ reference: "PAY-20260823-000001", userId: "buyer_1" });

      expect(result.outcome).toBe("SUCCESS");
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "SUCCESSFUL" }) })
      );
      expect(orderService.handleSuccessfulPurchase).toHaveBeenCalledWith("order_1", {
        paymentReference: "PAY-20260823-000001",
      });
    });

    it("REJECTS and does NOT run the pipeline when Paystack's amount doesn't match the order (manipulation protection)", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(basePayment());
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder()); // expects GHS 500
      mockPrisma.payment.update.mockImplementation(({ data }) => Promise.resolve({ ...basePayment(), ...data }));
      paystackService.verifyTransaction.mockResolvedValue({
        status: "success",
        amount: 100, // GHS 1.00 — manipulated/mismatched
        currency: "GHS",
      });

      await expect(
        paymentService.verifyPayment({ reference: "PAY-20260823-000001", userId: "buyer_1" })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(orderService.handleSuccessfulPurchase).not.toHaveBeenCalled();
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
      );
    });

    it("REJECTS when currency doesn't match the order", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(basePayment());
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder({ currency: "GHS" }));
      mockPrisma.payment.update.mockImplementation(({ data }) => Promise.resolve({ ...basePayment(), ...data }));
      paystackService.verifyTransaction.mockResolvedValue({
        status: "success",
        amount: 50000,
        currency: "NGN", // mismatched currency
      });

      await expect(
        paymentService.verifyPayment({ reference: "PAY-20260823-000001", userId: "buyer_1" })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(orderService.handleSuccessfulPurchase).not.toHaveBeenCalled();
    });

    it("marks the payment FAILED (not SUCCESSFUL) when Paystack reports a failed charge", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(basePayment());
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder());
      mockPrisma.payment.update.mockImplementation(({ data }) => Promise.resolve({ ...basePayment(), ...data }));
      paystackService.verifyTransaction.mockResolvedValue({ status: "failed", gateway_response: "Declined" });

      const result = await paymentService.verifyPayment({ reference: "PAY-20260823-000001", userId: "buyer_1" });

      expect(result.outcome).toBe("FAILED");
      expect(orderService.handleSuccessfulPurchase).not.toHaveBeenCalled();
    });

    it("is idempotent: re-verifying an already-SUCCESSFUL payment does not call Paystack or the pipeline again", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(basePayment({ status: "SUCCESSFUL" }));
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder({ status: "PAID" }));

      const result = await paymentService.verifyPayment({ reference: "PAY-20260823-000001", userId: "buyer_1" });

      expect(result.outcome).toBe("SUCCESS");
      expect(paystackService.verifyTransaction).not.toHaveBeenCalled();
      expect(orderService.handleSuccessfulPurchase).not.toHaveBeenCalled();
    });
  });

  describe("handleWebhookEvent — signature verification + idempotency", () => {
    function chargeSuccessBody(reference = "PAY-20260823-000001") {
      return JSON.stringify({ event: "charge.success", data: { reference } });
    }

    it("rejects a webhook with an invalid signature and processes nothing", async () => {
      const rawBody = Buffer.from(chargeSuccessBody());

      await expect(
        paymentService.handleWebhookEvent({ rawBody, signature: "not-the-real-signature" })
      ).rejects.toMatchObject({ statusCode: 401 });

      expect(mockPrisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it("processes a validly-signed charge.success event exactly once", async () => {
      const rawBodyString = chargeSuccessBody();
      const rawBody = Buffer.from(rawBodyString);
      const signature = sign(rawBodyString);

      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay_1",
        orderId: "order_1",
        userId: "buyer_1",
        providerReference: "PAY-20260823-000001",
        amount: 500,
        currency: "GHS",
        status: "INITIALIZED",
      });
      mockPrisma.order.findUnique.mockResolvedValue(baseOrder());
      mockPrisma.payment.update.mockImplementation(({ data }) => Promise.resolve({ id: "pay_1", ...data }));
      paystackService.verifyTransaction.mockResolvedValue({
        status: "success",
        amount: 50000,
        currency: "GHS",
        id: 999,
      });
      orderService.handleSuccessfulPurchase.mockResolvedValue({ id: "order_1", status: "PAID" });

      const result = await paymentService.handleWebhookEvent({ rawBody, signature });

      expect(result.processed).toBe(true);
      expect(orderService.handleSuccessfulPurchase).toHaveBeenCalledTimes(1);
    });

    it("ignores a duplicate delivery for an already-SUCCESSFUL payment (no re-processing)", async () => {
      const rawBodyString = chargeSuccessBody();
      const rawBody = Buffer.from(rawBodyString);
      const signature = sign(rawBodyString);

      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "pay_1",
        orderId: "order_1",
        userId: "buyer_1",
        providerReference: "PAY-20260823-000001",
        amount: 500,
        currency: "GHS",
        status: "SUCCESSFUL",
      });

      const result = await paymentService.handleWebhookEvent({ rawBody, signature });

      expect(result.processed).toBe(false);
      expect(result.alreadyProcessed).toBe(true);
      expect(paystackService.verifyTransaction).not.toHaveBeenCalled();
      expect(orderService.handleSuccessfulPurchase).not.toHaveBeenCalled();
    });

    it("acknowledges but creates no records for an unknown payment reference", async () => {
      const rawBodyString = chargeSuccessBody("SOME-UNKNOWN-REF");
      const rawBody = Buffer.from(rawBodyString);
      const signature = sign(rawBodyString);

      mockPrisma.payment.findUnique.mockResolvedValue(null);

      const result = await paymentService.handleWebhookEvent({ rawBody, signature });

      expect(result.acknowledged).toBe(true);
      expect(result.processed).toBe(false);
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it("acknowledges non-charge.success events without touching any financial record", async () => {
      const rawBodyString = JSON.stringify({ event: "transfer.success", data: {} });
      const rawBody = Buffer.from(rawBodyString);
      const signature = sign(rawBodyString);

      const result = await paymentService.handleWebhookEvent({ rawBody, signature });

      expect(result.processed).toBe(false);
      expect(mockPrisma.payment.findUnique).not.toHaveBeenCalled();
    });
  });
});
