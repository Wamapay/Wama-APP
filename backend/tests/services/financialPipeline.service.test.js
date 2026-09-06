"use strict";

const { createPrismaMock, withDefaultTransaction } = require("../helpers/mockPrisma");

const mockPrisma = withDefaultTransaction(createPrismaMock());

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/services/agent.service", () => ({
  updateAgentVerification: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../src/services/reward.service", () => ({
  evaluateReferralRewards: jest.fn().mockResolvedValue([]),
}));

const financialPipelineService = require("../../src/services/financialPipeline.service");
const agentService = require("../../src/services/agent.service");
const rewardService = require("../../src/services/reward.service");

function baseOrder(overrides = {}) {
  return {
    id: "order_1",
    orderNumber: "ORD-20260822-000001",
    userId: "buyer_1",
    courseId: "course_1",
    amount: 500,
    currency: "GHS",
    agentId: null,
    referralCode: null,
    ...overrides,
  };
}

function mockLedgerPrimitives() {
  mockPrisma.transaction.findFirst.mockResolvedValue(null); // nothing processed yet
  mockPrisma.transaction.count.mockResolvedValue(0);
  mockPrisma.transaction.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: `txn_${Math.random().toString(36).slice(2)}`, ...data })
  );
  mockPrisma.user.update.mockResolvedValue({});
}

function createdTransactionsByType() {
  return mockPrisma.transaction.create.mock.calls.reduce((acc, [{ data }]) => {
    acc[data.type] = acc[data.type] || [];
    acc[data.type].push(data);
    return acc;
  }, {});
}

describe("financial pipeline — mandatory scenarios (platform rule items 70-74)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withDefaultTransaction(mockPrisma);
  });

  // Platform rule "Financial Transaction Test" / "No-Referral Test"
  it("GH₵500 purchase with NO referral: cashback GH₵100, commission GH₵0, no successful referral", async () => {
    mockLedgerPrimitives();
    mockPrisma.referral.findUnique.mockResolvedValue(null); // buyer was never referred

    const result = await financialPipelineService.runPurchaseFinancialPipeline(baseOrder());

    const byType = createdTransactionsByType();
    expect(byType.COURSE_PURCHASE).toHaveLength(1);
    expect(byType.CASHBACK).toHaveLength(1);
    expect(byType.CASHBACK[0].amount.toString()).toBe("100");
    expect(byType.COMMISSION).toBeUndefined();

    expect(result.commission.referral).toBeNull();
    expect(mockPrisma.referral.update).not.toHaveBeenCalled();
    expect(mockPrisma.agent.update).not.toHaveBeenCalled();
    expect(agentService.updateAgentVerification).not.toHaveBeenCalled();
    expect(rewardService.evaluateReferralRewards).not.toHaveBeenCalled();
  });

  // Platform rule "Referral Test"
  it("Agent refers User B; User B's GH₵500 purchase pays GH₵100 cashback + GH₵200 commission, marks the referral SUCCESSFUL, and +1's the Agent", async () => {
    mockLedgerPrimitives();
    mockPrisma.referral.findUnique.mockResolvedValue({
      id: "referral_1",
      agentId: "agent_1",
      referredUserId: "buyerB",
      referralCode: "AGT10001",
      status: "REGISTERED",
      agent: { id: "agent_1", userId: "agentOwner_1" },
    });
    mockPrisma.agent.update.mockResolvedValue({ id: "agent_1", userId: "agentOwner_1", successfulReferrals: 1 });
    mockPrisma.referral.update.mockResolvedValue({
      id: "referral_1",
      agentId: "agent_1",
      status: "SUCCESSFUL",
      orderId: "order_1",
      successfulAt: new Date(),
    });

    const order = baseOrder({ userId: "buyerB" });
    const result = await financialPipelineService.runPurchaseFinancialPipeline(order);

    const byType = createdTransactionsByType();
    expect(byType.CASHBACK[0].amount.toString()).toBe("100");
    expect(byType.CASHBACK[0].userId).toBe("buyerB");
    expect(byType.COMMISSION).toHaveLength(1);
    expect(byType.COMMISSION[0].amount.toString()).toBe("200");
    expect(byType.COMMISSION[0].userId).toBe("agentOwner_1"); // credited to the Agent's user, not the buyer

    expect(mockPrisma.agent.update).toHaveBeenCalledWith({
      where: { id: "agent_1" },
      data: { successfulReferrals: { increment: 1 } },
    });
    expect(mockPrisma.referral.update).toHaveBeenCalledWith({
      where: { id: "referral_1" },
      data: expect.objectContaining({ status: "SUCCESSFUL", orderId: "order_1" }),
    });

    expect(result.commission.referral).not.toBeNull();
    expect(agentService.updateAgentVerification).toHaveBeenCalledWith("agent_1");
    expect(rewardService.evaluateReferralRewards).toHaveBeenCalledWith("agent_1");
  });

  // Platform rule "Self-Referral Test" / "Self-Referral Protection"
  it("an Agent purchasing via their own referral code earns no commission and creates no successful referral", async () => {
    mockLedgerPrimitives();
    mockPrisma.referral.findUnique.mockResolvedValue({
      id: "referral_self",
      agentId: "agent_1",
      referredUserId: "agentOwner_1",
      referralCode: "AGT10001",
      status: "REGISTERED",
      agent: { id: "agent_1", userId: "agentOwner_1" }, // same user as the buyer below
    });

    const order = baseOrder({ userId: "agentOwner_1", agentId: "agent_1", referralCode: "AGT10001" });
    const result = await financialPipelineService.runPurchaseFinancialPipeline(order);

    const byType = createdTransactionsByType();
    expect(byType.COMMISSION).toBeUndefined();
    expect(byType.CASHBACK[0].amount.toString()).toBe("100"); // cashback is unaffected by self-referral

    expect(mockPrisma.referral.update).not.toHaveBeenCalled();
    expect(mockPrisma.agent.update).not.toHaveBeenCalled();
    expect(result.commission.referral).toBeNull();
  });

  // Platform rule "Duplicate Processing Test" / "Payment Idempotency"
  it("processing the same order's payment twice never creates a second cashback/commission/referral-success/reward", async () => {
    mockLedgerPrimitives();
    mockPrisma.referral.findUnique.mockResolvedValue({
      id: "referral_1",
      agentId: "agent_1",
      referredUserId: "buyerB",
      referralCode: "AGT10001",
      status: "REGISTERED",
      agent: { id: "agent_1", userId: "agentOwner_1" },
    });
    mockPrisma.agent.update.mockResolvedValue({ id: "agent_1", userId: "agentOwner_1", successfulReferrals: 1 });
    mockPrisma.referral.update.mockResolvedValue({
      id: "referral_1",
      agentId: "agent_1",
      status: "SUCCESSFUL",
      orderId: "order_1",
    });

    const order = baseOrder({ userId: "buyerB" });

    const first = await financialPipelineService.runPurchaseFinancialPipeline(order);
    expect(first.alreadyProcessed).toBe(false);

    // Second run: the pre-check (COURSE_PURCHASE lookup) now finds the row
    // the first run created — the whole pipeline short-circuits.
    mockPrisma.transaction.findFirst.mockResolvedValue({ id: "txn_existing", type: "COURSE_PURCHASE" });

    const second = await financialPipelineService.runPurchaseFinancialPipeline(order);
    expect(second.alreadyProcessed).toBe(true);

    // Only the first run's writes happened.
    expect(mockPrisma.agent.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.referral.update).toHaveBeenCalledTimes(1);
    const byType = createdTransactionsByType();
    expect(byType.CASHBACK).toHaveLength(1);
    expect(byType.COMMISSION).toHaveLength(1);
  });

  describe("feature toggles — a disabled sub-feature skips gracefully, never breaks the purchase", () => {
    it("cashback disabled: the course purchase still succeeds, but no cashback is recorded", async () => {
      mockLedgerPrimitives();
      mockPrisma.referral.findUnique.mockResolvedValue(null);
      mockPrisma.platformSettings.upsert.mockResolvedValue({
        id: "platform-settings-singleton",
        cashbackRatePercent: "20",
        commissionRatePercent: "40",
        featuresEnabled: { courses: true, referrals: true, cashback: false, rewards: true, withdrawals: true, reviews: true },
      });

      const result = await financialPipelineService.runPurchaseFinancialPipeline(baseOrder());

      const byType = createdTransactionsByType();
      expect(byType.COURSE_PURCHASE).toHaveLength(1); // the purchase itself is untouched
      expect(byType.CASHBACK).toBeUndefined(); // but no cashback was recorded
      expect(result.cashback.amount).toBeNull();
    });

    it("referrals disabled: commission is skipped AND the referral is not marked successful (no partial state)", async () => {
      mockLedgerPrimitives();
      mockPrisma.referral.findUnique.mockResolvedValue({
        id: "referral_1", agentId: "agent_1", referredUserId: "buyerB",
        referralCode: "AGT10001", status: "REGISTERED", agent: { id: "agent_1", userId: "agentOwner_1" },
      });
      mockPrisma.platformSettings.upsert.mockResolvedValue({
        id: "platform-settings-singleton",
        cashbackRatePercent: "20",
        commissionRatePercent: "40",
        featuresEnabled: { courses: true, referrals: false, cashback: true, rewards: true, withdrawals: true, reviews: true },
      });

      const result = await financialPipelineService.runPurchaseFinancialPipeline(baseOrder({ userId: "buyerB" }));

      const byType = createdTransactionsByType();
      expect(byType.CASHBACK).toHaveLength(1); // unaffected — only "referrals" was disabled
      expect(byType.COMMISSION).toBeUndefined();
      expect(mockPrisma.referral.update).not.toHaveBeenCalled(); // never marked SUCCESSFUL
      expect(mockPrisma.agent.update).not.toHaveBeenCalled(); // successfulReferrals never incremented
      expect(result.commission.referral).toBeNull();
      expect(agentService.updateAgentVerification).not.toHaveBeenCalled();
      expect(rewardService.evaluateReferralRewards).not.toHaveBeenCalled();
    });
  });
});
