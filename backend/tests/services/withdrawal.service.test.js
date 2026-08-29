"use strict";

const { createPrismaMock, withDefaultTransaction } = require("../helpers/mockPrisma");

const mockPrisma = withDefaultTransaction(createPrismaMock());

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/services/admin.service", () => ({
  logAdminActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/services/paystack.service", () => ({
  listGhanaBanks: jest.fn(),
  createTransferRecipient: jest.fn(),
  initiateTransfer: jest.fn(),
  fetchTransfer: jest.fn(),
}));

const withdrawalService = require("../../src/services/withdrawal.service");
const adminService = require("../../src/services/admin.service");
const paystackService = require("../../src/services/paystack.service");

function mockLedgerPrimitives() {
  mockPrisma.transaction.findFirst.mockResolvedValue(null);
  mockPrisma.transaction.count.mockResolvedValue(0);
  mockPrisma.transaction.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: `txn_${Math.random().toString(36).slice(2)}`, ...data })
  );
}

// Shared happy-path Paystack mocks for approve() tests — a fresh
// recipient is created (none reused) and the transfer comes back
// "pending" (the normal real-world async case; success/failure then
// arrive later via the webhook — see payment.service.test.js).
function mockPaystackRecipientAndTransferHappyPath() {
  mockPrisma.paystackRecipient.findUnique.mockResolvedValue(null);
  paystackService.listGhanaBanks.mockResolvedValue([{ name: "MTN Mobile Money", code: "MTN" }]);
  paystackService.createTransferRecipient.mockResolvedValue({ recipient_code: "RCP_test_1" });
  mockPrisma.paystackRecipient.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: "rcpt_1", ...data })
  );
  paystackService.initiateTransfer.mockResolvedValue({ status: "pending", transfer_code: "TRF_test_1" });
}

const SAMPLE_MOBILE_MONEY_DETAILS = { type: "mobile_money", bankCode: "MTN", phone: "0244123456", accountName: "Test User" };

describe("withdrawal.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withDefaultTransaction(mockPrisma);
  });

  describe("createWithdrawal — platform rule 'Withdrawal Test'", () => {
    it("reserves the balance atomically and creates a PENDING withdrawal + ledger transaction", async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.withdrawal.count.mockResolvedValue(0);
      mockPrisma.withdrawal.create.mockImplementation(({ data }) => Promise.resolve({ id: "wd_1", ...data }));
      mockLedgerPrimitives();

      const withdrawal = await withdrawalService.createWithdrawal({
        userId: "user_1",
        amount: 50,
        balanceType: "CASHBACK",
        paymentMethod: "mobile_money",
        paymentDetails: SAMPLE_MOBILE_MONEY_DETAILS,
      });

      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: "user_1", cashbackBalance: { gte: expect.anything() } },
        data: { cashbackBalance: { decrement: expect.anything() } },
      });
      expect(withdrawal.withdrawalId).toMatch(/^WD-\d{8}-\d{6}$/);
      expect(withdrawal.status).toBe("PENDING");
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "WITHDRAWAL", balanceType: "CASHBACK" }) })
      );
    });

    // Phase 11 §2: the 5% fee is calculated server-side and never
    // trusted from the client — these are the exact worked examples
    // from the spec (test cases A/B).
    it("calculates a 5% fee and net payout server-side — GH₵100 -> fee GH₵5, net GH₵95", async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.withdrawal.count.mockResolvedValue(0);
      mockPrisma.withdrawal.create.mockImplementation(({ data }) => Promise.resolve({ id: "wd_fee1", ...data }));
      mockLedgerPrimitives();

      const withdrawal = await withdrawalService.createWithdrawal({
        userId: "user_1", amount: 100, balanceType: "CASHBACK",
        paymentMethod: "mobile_money", paymentDetails: SAMPLE_MOBILE_MONEY_DETAILS,
      });

      expect(withdrawal.fee.toString()).toBe("5");
      expect(withdrawal.netAmount.toString()).toBe("95");
      // A separate, informational-only WITHDRAWAL_FEE ledger row exists
      // (Phase 11 §15) and never applies its own balance change.
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "WITHDRAWAL_FEE", amount: expect.anything() }) })
      );
    });

    it("calculates a 5% fee and net payout server-side — GH₵1,000 -> fee GH₵50, net GH₵950", async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.withdrawal.count.mockResolvedValue(0);
      mockPrisma.withdrawal.create.mockImplementation(({ data }) => Promise.resolve({ id: "wd_fee2", ...data }));
      mockLedgerPrimitives();

      const withdrawal = await withdrawalService.createWithdrawal({
        userId: "user_1", amount: 1000, balanceType: "COMMISSION",
        paymentMethod: "mobile_money", paymentDetails: SAMPLE_MOBILE_MONEY_DETAILS,
      });

      expect(withdrawal.fee.toString()).toBe("50");
      expect(withdrawal.netAmount.toString()).toBe("950");
      // The GROSS amount is still what's reserved from the balance —
      // never net, never gross+fee (Phase 11 §14).
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: "user_1", commissionBalance: { gte: expect.anything() } },
        data: { commissionBalance: { decrement: expect.anything() } },
      });
    });

    it("rejects when the actual available balance is insufficient — GH₵100 balance, GH₵150 request", async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 0 }); // WHERE balance >= amount matched nothing

      await expect(
        withdrawalService.createWithdrawal({
          userId: "user_1",
          amount: 150,
          balanceType: "CASHBACK",
          paymentMethod: "mobile_money",
          paymentDetails: SAMPLE_MOBILE_MONEY_DETAILS,
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(mockPrisma.withdrawal.create).not.toHaveBeenCalled();
    });

    it("rejects an invalid balance type", async () => {
      await expect(
        withdrawalService.createWithdrawal({ userId: "user_1", amount: 10, balanceType: "BONUS", paymentMethod: "mobile_money", paymentDetails: SAMPLE_MOBILE_MONEY_DETAILS })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a zero amount — no minimum floor exists, this is just 'greater than zero'", async () => {
      await expect(
        withdrawalService.createWithdrawal({ userId: "user_1", amount: 0, balanceType: "CASHBACK", paymentMethod: "mobile_money", paymentDetails: SAMPLE_MOBILE_MONEY_DETAILS })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("never enforces a maximum withdrawal amount", async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.withdrawal.count.mockResolvedValue(0);
      mockPrisma.withdrawal.create.mockImplementation(({ data }) => Promise.resolve({ id: "wd_big", ...data }));
      mockLedgerPrimitives();

      const withdrawal = await withdrawalService.createWithdrawal({
        userId: "user_1",
        amount: 1_000_000,
        balanceType: "COMMISSION",
        paymentMethod: "bank",
        paymentDetails: { type: "bank", bankCode: "GH010100", accountNumber: "1234567890", accountName: "Test User" },
      });

      expect(withdrawal.amount.toString()).toBe("1000000");
    });

    // Platform rule "Concurrency Test" (mandatory): two simultaneous
    // requests against the same balance can never both succeed. The
    // reservation is a single conditional UPDATE (`WHERE balance >= amount`),
    // which Postgres serializes per-row — simulated here by having the
    // second call's updateMany report zero matched rows once the first
    // has "spent" the balance.
    it("prevents a second concurrent withdrawal from over-spending an already-reserved balance", async () => {
      mockPrisma.user.updateMany
        .mockResolvedValueOnce({ count: 1 }) // first request wins the reservation
        .mockResolvedValueOnce({ count: 0 }); // second request's WHERE no longer matches
      mockPrisma.withdrawal.count.mockResolvedValue(0);
      mockPrisma.withdrawal.create.mockImplementation(({ data }) => Promise.resolve({ id: "wd_1", ...data }));
      mockLedgerPrimitives();

      const first = await withdrawalService.createWithdrawal({
        userId: "user_1",
        amount: 50,
        balanceType: "CASHBACK",
        paymentMethod: "mobile_money",
        paymentDetails: SAMPLE_MOBILE_MONEY_DETAILS,
      });
      expect(first.status).toBe("PENDING");

      await expect(
        withdrawalService.createWithdrawal({ userId: "user_1", amount: 60, balanceType: "CASHBACK", paymentMethod: "mobile_money", paymentDetails: SAMPLE_MOBILE_MONEY_DETAILS })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("admin approve / reject / complete — platform rules 'Withdrawal Failure Test' / 'Withdrawal Completion Test'", () => {
    it("PENDING -> PROCESSING on approve, with a real Paystack transfer initiated for the NET amount only", async () => {
      // approve() re-fetches the withdrawal itself first (for the
      // self-approval check + payout details), THEN does the atomic
      // conditional claim.
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        id: "wd_1", status: "PENDING", userId: "user_1", balanceType: "CASHBACK",
        amount: 100, fee: 5, netAmount: 95, currency: "GHS", withdrawalId: "WD-20260822-000001",
        reference: "TRF-20260822-000001", paymentMethod: "mobile_money", paymentDetails: SAMPLE_MOBILE_MONEY_DETAILS,
      });
      mockPrisma.withdrawal.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.withdrawal.update.mockImplementation(({ data }) => Promise.resolve({ id: "wd_1", status: "PROCESSING", ...data }));
      mockPaystackRecipientAndTransferHappyPath();

      const updated = await withdrawalService.approveWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1" });

      expect(mockPrisma.withdrawal.updateMany).toHaveBeenCalledWith({
        where: { id: "wd_1", status: "PENDING" },
        data: { status: "PROCESSING" },
      });
      // The transfer must be for the NET amount (in pesewas: 95 * 100),
      // never the gross (Phase 11 §2/§6).
      expect(paystackService.initiateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ amountSubunit: 9500, reference: "TRF-20260822-000001" })
      );
      expect(updated.status).toBe("PROCESSING");
      expect(updated.transferCode).toBe("TRF_test_1");
      expect(adminService.logAdminActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: "APPROVE_WITHDRAWAL", targetId: "wd_1" })
      );
    });

    it("refuses to approve a non-PENDING withdrawal", async () => {
      // The conditional updateMany's WHERE (status: PENDING) matches
      // nothing for an already-COMPLETED withdrawal.
      mockPrisma.withdrawal.findUnique.mockResolvedValue({ id: "wd_1", status: "COMPLETED", userId: "user_1" });
      mockPrisma.withdrawal.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        withdrawalService.approveWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    // Phase 11 §10: an admin can never approve/reject/complete their OWN
    // withdrawal — checked server-side, before any status transition.
    it("refuses to let an admin approve their own withdrawal", async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({ id: "wd_1", status: "PENDING", userId: "admin_1" });
      await expect(
        withdrawalService.approveWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.withdrawal.updateMany).not.toHaveBeenCalled();
    });

    it("if Paystack rejects the transfer, the withdrawal fails immediately and the full gross balance is restored", async () => {
      const base = {
        id: "wd_1", userId: "user_1", balanceType: "CASHBACK",
        amount: 100, fee: 5, netAmount: 95, currency: "GHS", withdrawalId: "WD-20260822-000001",
        reference: "TRF-20260822-000001", paymentMethod: "mobile_money", paymentDetails: SAMPLE_MOBILE_MONEY_DETAILS,
      };
      mockPrisma.withdrawal.findUnique
        .mockResolvedValueOnce({ ...base, status: "PENDING" }) // approveWithdrawal's own pre-check read
        .mockResolvedValueOnce({ ...base, status: "PROCESSING" }) // reverseAndFailWithdrawal's tx pre-update read
        .mockResolvedValueOnce({ ...base, status: "FAILED", rejectionReason: "Recipient account invalid." }); // read-back
      mockPrisma.withdrawal.updateMany
        .mockResolvedValueOnce({ count: 1 }) // PENDING -> PROCESSING claim succeeds
        .mockResolvedValueOnce({ count: 1 }); // the subsequent PROCESSING -> FAILED reversal claim
      mockPrisma.paystackRecipient.findUnique.mockResolvedValue(null);
      paystackService.listGhanaBanks.mockResolvedValue([{ name: "MTN Mobile Money", code: "MTN" }]);
      paystackService.createTransferRecipient.mockResolvedValue({ recipient_code: "RCP_test_1" });
      mockPrisma.paystackRecipient.create.mockImplementation(({ data }) => Promise.resolve({ id: "rcpt_1", ...data }));
      paystackService.initiateTransfer.mockRejectedValue(new Error("Recipient account invalid."));
      mockPrisma.user.update.mockResolvedValue({});
      mockLedgerPrimitives();

      const result = await withdrawalService.approveWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1" });

      expect(result.status).toBe("FAILED");
      expect(result.rejectionReason).toContain("Recipient account invalid");
      // Full GROSS (100), never just net — see file header accounting model.
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { cashbackBalance: { increment: 100 } },
      });
    });

    it("reject restores the held balance via a WITHDRAWAL_REVERSAL and marks FAILED with a reason", async () => {
      mockPrisma.withdrawal.findUnique
        .mockResolvedValueOnce({
          id: "wd_1",
          status: "PENDING",
          userId: "user_1",
          balanceType: "CASHBACK",
          amount: 50,
          currency: "GHS",
          withdrawalId: "WD-20260822-000001",
        }) // pre-check read (self-approval guard)
        .mockResolvedValueOnce({
          id: "wd_1", status: "PENDING", userId: "user_1", balanceType: "CASHBACK",
          amount: 50, currency: "GHS", withdrawalId: "WD-20260822-000001",
        }) // reverseAndFailWithdrawal's own pre-update read
        .mockResolvedValueOnce({ id: "wd_1", status: "FAILED", rejectionReason: "Invalid account details" }); // read-back
      // The conditional updateMany (status IN PENDING/PROCESSING) claims
      // the transition before any balance is touched — see
      // withdrawal.service.js.
      mockPrisma.withdrawal.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.update.mockResolvedValue({});
      mockLedgerPrimitives();

      const updated = await withdrawalService.rejectWithdrawal({
        adminId: "admin_1",
        withdrawalId: "wd_1",
        reason: "Invalid account details",
      });

      expect(mockPrisma.withdrawal.updateMany).toHaveBeenCalledWith({
        where: { id: "wd_1", status: { in: ["PENDING", "PROCESSING"] } },
        data: expect.objectContaining({ status: "FAILED", rejectionReason: "Invalid account details" }),
      });
      expect(updated.status).toBe("FAILED");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { cashbackBalance: { increment: 50 } },
      });
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "WITHDRAWAL_REVERSAL" }) })
      );
    });

    it("requires a non-empty reason to reject", async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({ id: "wd_1", status: "PENDING", userId: "user_1" });
      await expect(
        withdrawalService.rejectWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1", reason: "  " })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("refuses to let an admin reject their own withdrawal", async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({ id: "wd_1", status: "PENDING", userId: "admin_1" });
      await expect(
        withdrawalService.rejectWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1", reason: "self reject" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.withdrawal.updateMany).not.toHaveBeenCalled();
    });

    it("never double-reverses the balance when reject races another reject/complete for the same withdrawal", async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        id: "wd_1",
        status: "PROCESSING",
        userId: "user_1",
        balanceType: "CASHBACK",
        amount: 50,
        currency: "GHS",
        withdrawalId: "WD-20260822-000001",
      });
      // Someone else's concurrent call already claimed the transition —
      // this call's conditional updateMany matches zero rows, so it must
      // bail out BEFORE crediting the balance back.
      mockPrisma.withdrawal.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        withdrawalService.rejectWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1", reason: "too slow" })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });

    it("PROCESSING -> COMPLETED on complete, only after Paystack independently confirms success", async () => {
      mockPrisma.withdrawal.findUnique
        .mockResolvedValueOnce({ id: "wd_1", status: "PROCESSING", userId: "user_1", transferCode: "TRF_test_1" }) // pre-check read
        .mockResolvedValueOnce({ id: "wd_1", status: "COMPLETED", reference: "REF123" }); // read-back
      mockPrisma.withdrawal.updateMany.mockResolvedValueOnce({ count: 1 });
      paystackService.fetchTransfer.mockResolvedValue({ status: "success" });

      const updated = await withdrawalService.completeWithdrawal({
        adminId: "admin_1",
        withdrawalId: "wd_1",
        reference: "REF123",
      });
      expect(paystackService.fetchTransfer).toHaveBeenCalledWith("TRF_test_1");
      expect(mockPrisma.withdrawal.updateMany).toHaveBeenCalledWith({
        where: { id: "wd_1", status: "PROCESSING" },
        data: expect.objectContaining({ status: "COMPLETED", reference: "REF123" }),
      });
      expect(updated.status).toBe("COMPLETED");
    });

    // Regression test for a real bug found during the Phase 11 audit:
    // AdminActivity.adminId is a required (non-nullable) foreign key in
    // the schema, but the transfer.success webhook completes a
    // withdrawal with adminId: null (it's Paystack confirming the
    // payout, not a human admin action) — logAdminActivity must never be
    // called in that case, or this would throw a real database error in
    // production even though it's invisible against a fully-mocked test.
    it("does NOT call logAdminActivity when completed via the webhook path (adminId: null)", async () => {
      mockPrisma.withdrawal.findUnique
        .mockResolvedValueOnce({ id: "wd_1", status: "PROCESSING", userId: "user_1", transferCode: "TRF_test_1" })
        .mockResolvedValueOnce({ id: "wd_1", status: "COMPLETED" });
      mockPrisma.withdrawal.updateMany.mockResolvedValueOnce({ count: 1 });

      await withdrawalService.completeWithdrawal({
        adminId: null,
        withdrawalId: "wd_1",
        _verifiedTransfer: { status: "success" },
      });

      expect(paystackService.fetchTransfer).not.toHaveBeenCalled(); // _verifiedTransfer was already supplied
      expect(adminService.logAdminActivity).not.toHaveBeenCalled();
    });

    // Phase 11 §17: the manual complete endpoint must NEVER allow an
    // admin to mark a withdrawal COMPLETED just because they say so — it
    // must independently confirm with Paystack first.
    it("refuses to complete when Paystack has not actually confirmed a successful transfer", async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        id: "wd_1", status: "PROCESSING", userId: "user_1", transferCode: "TRF_test_1",
      });
      paystackService.fetchTransfer.mockResolvedValue({ status: "pending" });

      await expect(
        withdrawalService.completeWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1" })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.withdrawal.updateMany).not.toHaveBeenCalled();
    });

    it("refuses to let an admin complete their own withdrawal", async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({ id: "wd_1", status: "PROCESSING", userId: "admin_1" });
      await expect(
        withdrawalService.completeWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1" })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("a completed withdrawal cannot be completed again", async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({ id: "wd_1", status: "COMPLETED", userId: "user_1" });
      await expect(
        withdrawalService.completeWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("a completed withdrawal cannot be rejected afterward", async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({ id: "wd_1", status: "COMPLETED", userId: "user_1" });
      mockPrisma.withdrawal.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        withdrawalService.rejectWithdrawal({ adminId: "admin_1", withdrawalId: "wd_1", reason: ", too late" })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});

