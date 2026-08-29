"use strict";

const { createPrismaMock, withDefaultTransaction } = require("../helpers/mockPrisma");

const mockPrisma = withDefaultTransaction(createPrismaMock());

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));

const rewardService = require("../../src/services/reward.service");

function mockLedgerPrimitives() {
  mockPrisma.transaction.findFirst.mockResolvedValue(null);
  mockPrisma.transaction.count.mockResolvedValue(0);
  mockPrisma.transaction.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: `txn_${Math.random().toString(36).slice(2)}`, ...data })
  );
  mockPrisma.user.update.mockResolvedValue({});

  // Prisma's real `update` returns the FULL row, not just the changed
  // fields — this mock mirrors that by merging onto what `create` stored,
  // so `reward.update`'s later `{ transactionId }`-only payload doesn't
  // wipe out milestone/amount/etc. in the object the service returns.
  const rows = {};
  mockPrisma.reward.create.mockImplementation(({ data }) => {
    const row = { id: `rw_${data.milestone}`, ...data };
    rows[row.id] = row;
    return Promise.resolve(row);
  });
  mockPrisma.reward.update.mockImplementation(({ where, data }) => {
    const merged = { ...(rows[where.id] || {}), ...data };
    rows[where.id] = merged;
    return Promise.resolve(merged);
  });
}

describe("reward.service.evaluateReferralRewards — platform rule 'Reward Test'", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withDefaultTransaction(mockPrisma);
  });

  it("awards 50 at 10, 75 at 15, and 100 at 20 successful referrals as three SEPARATE rewards", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({ id: "agent_1", userId: "user_1" });
    mockPrisma.referral.count.mockResolvedValue(20);
    mockPrisma.reward.findMany.mockResolvedValue([]); // nothing awarded yet this week
    mockLedgerPrimitives();

    const awarded = await rewardService.evaluateReferralRewards("agent_1");

    expect(awarded.map((r) => r.milestone).sort((a, b) => a - b)).toEqual([10, 15, 20]);
    expect(awarded.map((r) => r.amount)).toEqual(["50", "75", "100"]);
    expect(mockPrisma.reward.create).toHaveBeenCalledTimes(3);
  });

  it("only awards milestones actually reached — 12 referrals earns 10 but not 15 or 20", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({ id: "agent_1", userId: "user_1" });
    mockPrisma.referral.count.mockResolvedValue(12);
    mockPrisma.reward.findMany.mockResolvedValue([]);
    mockLedgerPrimitives();

    const awarded = await rewardService.evaluateReferralRewards("agent_1");

    expect(awarded.map((r) => r.milestone)).toEqual([10]);
  });

  it("never re-awards a milestone already recorded for the same agent/week (duplicate protection)", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({ id: "agent_1", userId: "user_1" });
    mockPrisma.referral.count.mockResolvedValue(20);
    mockPrisma.reward.findMany.mockResolvedValue([{ milestone: 10 }, { milestone: 15 }, { milestone: 20 }]);

    const awarded = await rewardService.evaluateReferralRewards("agent_1");

    expect(awarded).toHaveLength(0);
    expect(mockPrisma.reward.create).not.toHaveBeenCalled();
  });

  it("only credits the milestones that are still missing when some were already awarded", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({ id: "agent_1", userId: "user_1" });
    mockPrisma.referral.count.mockResolvedValue(20);
    mockPrisma.reward.findMany.mockResolvedValue([{ milestone: 10 }]); // 10 already awarded
    mockLedgerPrimitives();

    const awarded = await rewardService.evaluateReferralRewards("agent_1");

    expect(awarded.map((r) => r.milestone).sort((a, b) => a - b)).toEqual([15, 20]);
  });

  it("returns an empty list for an unknown Agent instead of throwing", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue(null);
    const awarded = await rewardService.evaluateReferralRewards("nonexistent");
    expect(awarded).toEqual([]);
  });
});
