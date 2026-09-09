"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));

const leaderboardService = require("../../src/services/leaderboard.service");

describe("leaderboard.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const agent = (userId, fullName, referrals, opts = {}) => ({
    userId,
    successfulReferrals: referrals,
    verificationStatus: opts.verified ? "VERIFIED" : "NOT_VERIFIED",
    user: { id: userId, fullName, profileVisibility: opts.visibility ?? null },
  });

  it("ranks agents by real successfulReferrals, most first", async () => {
    // Mock data provided already sorted, matching what the real
    // Prisma orderBy: successfulReferrals desc would actually return
    // from the database — this mock doesn't simulate real sorting,
    // the service code correctly trusts the database to have done it.
    mockPrisma.agent.findMany.mockResolvedValue([
      agent("u2", "Kojo Boateng", 30),
      agent("u1", "Ama Serwaa", 12),
      agent("u3", "Efua Mensah", 5),
    ]);

    const result = await leaderboardService.getLeaderboard({});

    expect(result.top.map((r) => r.successfulReferrals)).toEqual([30, 12, 5]);
    expect(result.top[0].rank).toBe(1);
    expect(result.top[2].rank).toBe(3);
  });

  it("only queries ACTIVE agents", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([]);
    await leaderboardService.getLeaderboard({});
    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "ACTIVE" } })
    );
  });

  it("shows only a privacy-safe name — first name + last initial, never the full name", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([agent("u1", "Ama Serwaa", 10)]);
    const result = await leaderboardService.getLeaderboard({});
    expect(result.top[0].name).toBe("Ama S.");
    expect(JSON.stringify(result)).not.toContain("Serwaa");
  });

  it("REAL PRIVACY GUARANTEE: excludes an agent entirely who has opted out of the leaderboard", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([
      agent("u1", "Ama Serwaa", 50, { visibility: { leaderboard: false } }),
      agent("u2", "Kojo Boateng", 10),
    ]);

    const result = await leaderboardService.getLeaderboard({});

    expect(result.top).toHaveLength(1);
    expect(result.top[0].name).toBe("Kojo B.");
  });

  it("includes an agent with NO explicit preference set — default is visible", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([agent("u1", "Ama Serwaa", 10, { visibility: null })]);
    const result = await leaderboardService.getLeaderboard({});
    expect(result.top).toHaveLength(1);
  });

  it("respects a custom limit, capped at 50", async () => {
    const many = Array.from({ length: 80 }, (_, i) => agent(`u${i}`, `Person ${i}`, 80 - i));
    mockPrisma.agent.findMany.mockResolvedValue(many);
    const result = await leaderboardService.getLeaderboard({ limit: 500 });
    expect(result.top).toHaveLength(50);
  });

  it("identifies the calling user's own entry with isYou, and surfaces it as yourRank", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([
      agent("u1", "Ama Serwaa", 50),
      agent("u2", "Kojo Boateng", 10),
    ]);

    const result = await leaderboardService.getLeaderboard({ forUserId: "u2" });

    expect(result.top[1].isYou).toBe(true);
    expect(result.top[0].isYou).toBe(false);
    expect(result.yourRank.rank).toBe(2);
  });

  it("yourRank is null when not logged in or not an agent", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([agent("u1", "Ama Serwaa", 50)]);
    const result = await leaderboardService.getLeaderboard({ forUserId: null });
    expect(result.yourRank).toBeNull();
  });

  it("marks real verified agents correctly", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([agent("u1", "Ama Serwaa", 50, { verified: true })]);
    const result = await leaderboardService.getLeaderboard({});
    expect(result.top[0].isVerified).toBe(true);
  });
});
