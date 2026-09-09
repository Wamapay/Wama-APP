"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/config/env", () => ({
  config: { frontendUrl: "https://platform.example.com", isProduction: false, isDevelopment: true },
}));

const agentService = require("../../src/services/agent.service");

describe("agent.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createAgentForUser", () => {
    it("creates a new Agent with a unique agentId/referralCode and promotes the user's role", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", role: "USER", agent: null });
      mockPrisma.agent.count.mockResolvedValue(0);
      mockPrisma.agent.create.mockResolvedValue({
        id: "agent_1",
        userId: "user_1",
        agentId: "AGT-10001",
        referralCode: "AGT10001",
        status: "ACTIVE",
        successfulReferrals: 0,
        verificationStatus: "NOT_VERIFIED",
        verifiedAt: null,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const agent = await agentService.createAgentForUser("user_1");

      expect(mockPrisma.agent.create).toHaveBeenCalledWith({
        data: { userId: "user_1", agentId: "AGT-10001", referralCode: "AGT10001" },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { role: "AGENT" },
      });
      expect(agent.agentId).toBe("AGT-10001");
      expect(agent.referralLink).toBe("https://platform.example.com/register?ref=AGT10001");
    });

    it("is idempotent: calling it again for the same user returns the existing Agent without creating a second one", async () => {
      const existingAgent = {
        id: "agent_1",
        userId: "user_1",
        agentId: "AGT-10001",
        referralCode: "AGT10001",
        status: "ACTIVE",
        successfulReferrals: 3,
        verificationStatus: "NOT_VERIFIED",
        verifiedAt: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1",
        role: "AGENT",
        agent: existingAgent,
      });

      const agent = await agentService.createAgentForUser("user_1");

      expect(mockPrisma.agent.create).not.toHaveBeenCalled();
      expect(agent.id).toBe("agent_1");
    });

    it("retries with the next sequence number on a unique-constraint collision", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", role: "USER", agent: null });
      mockPrisma.agent.count.mockResolvedValue(0);

      const conflictError = Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["agentId"] },
      });

      mockPrisma.agent.create
        .mockRejectedValueOnce(conflictError)
        .mockResolvedValueOnce({
          id: "agent_2",
          userId: "user_1",
          agentId: "AGT-10002",
          referralCode: "AGT10002",
          status: "ACTIVE",
          successfulReferrals: 0,
          verificationStatus: "NOT_VERIFIED",
          verifiedAt: null,
        });
      mockPrisma.user.update.mockResolvedValue({});

      const agent = await agentService.createAgentForUser("user_1");

      expect(mockPrisma.agent.create).toHaveBeenCalledTimes(2);
      expect(agent.agentId).toBe("AGT-10002");
    });
  });

  describe("updateAgentVerification", () => {
    it("stays NOT_VERIFIED below the 20-referral threshold", async () => {
      mockPrisma.agent.findUnique.mockResolvedValue({
        id: "agent_1",
        successfulReferrals: 19,
        verificationStatus: "NOT_VERIFIED",
      });

      const agent = await agentService.updateAgentVerification("agent_1");

      expect(mockPrisma.agent.update).not.toHaveBeenCalled();
      expect(agent.verificationStatus).toBe("NOT_VERIFIED");
    });

    it("becomes VERIFIED once successfulReferrals reaches 20, and sets verifiedAt", async () => {
      mockPrisma.agent.findUnique.mockResolvedValue({
        id: "agent_1",
        successfulReferrals: 20,
        verificationStatus: "NOT_VERIFIED",
      });
      mockPrisma.agent.update.mockResolvedValue({
        id: "agent_1",
        successfulReferrals: 20,
        verificationStatus: "VERIFIED",
        verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        referralCode: "AGT10001",
      });

      const agent = await agentService.updateAgentVerification("agent_1");

      expect(mockPrisma.agent.update).toHaveBeenCalledWith({
        where: { id: "agent_1" },
        data: expect.objectContaining({ verificationStatus: "VERIFIED" }),
      });
      expect(agent.verificationStatus).toBe("VERIFIED");
      expect(agent.verifiedAt).toBeTruthy();
    });

    it("reverts to NOT_VERIFIED if successfulReferrals later drops below 20", async () => {
      mockPrisma.agent.findUnique.mockResolvedValue({
        id: "agent_1",
        successfulReferrals: 19,
        verificationStatus: "VERIFIED",
      });
      mockPrisma.agent.update.mockResolvedValue({
        id: "agent_1",
        successfulReferrals: 19,
        verificationStatus: "NOT_VERIFIED",
        verifiedAt: null,
        referralCode: "AGT10001",
      });

      const agent = await agentService.updateAgentVerification("agent_1");

      expect(agent.verificationStatus).toBe("NOT_VERIFIED");
      expect(agent.verifiedAt).toBeNull();
    });
  });
});
