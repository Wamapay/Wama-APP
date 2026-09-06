"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/utils/password", () => ({
  hashPassword: jest.fn(async (pw) => `hashed:${pw}`),
  verifyPassword: jest.fn(async (pw, hash) => hash === `hashed:${pw}`),
}));

const withdrawalPinService = require("../../src/services/withdrawalPin.service");

describe("withdrawalPin.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("setWithdrawalPin", () => {
    it("rejects a PIN that isn't exactly 4 digits", async () => {
      await expect(withdrawalPinService.setWithdrawalPin("user_1", "123", "pw")).rejects.toMatchObject({ statusCode: 400 });
      await expect(withdrawalPinService.setWithdrawalPin("user_1", "12345", "pw")).rejects.toMatchObject({ statusCode: 400 });
      await expect(withdrawalPinService.setWithdrawalPin("user_1", "abcd", "pw")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(withdrawalPinService.setWithdrawalPin("ghost", "1234", "pw")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("requires the correct current password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", passwordHash: "hashed:correct-password" });
      await expect(
        withdrawalPinService.setWithdrawalPin("user_1", "1234", "wrong-password")
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("sets a real hashed PIN and resets any prior lockout state", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", passwordHash: "hashed:correct-password" });
      mockPrisma.user.update.mockResolvedValue({});

      await withdrawalPinService.setWithdrawalPin("user_1", "1234", "correct-password");

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { withdrawalPinHash: "hashed:1234", withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null },
      });
    });

    it("never stores the raw PIN anywhere in the update payload", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", passwordHash: "hashed:correct-password" });
      mockPrisma.user.update.mockResolvedValue({});

      await withdrawalPinService.setWithdrawalPin("user_1", "1234", "correct-password");

      const callArgs = mockPrisma.user.update.mock.calls[0][0];
      expect(JSON.stringify(callArgs)).not.toContain('"1234"');
      expect(callArgs.data.withdrawalPinHash).toBe("hashed:1234"); // hashed form only
    });
  });

  describe("hasWithdrawalPin", () => {
    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(withdrawalPinService.hasWithdrawalPin("ghost")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("returns false when no PIN is set", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ withdrawalPinHash: null });
      expect(await withdrawalPinService.hasWithdrawalPin("user_1")).toBe(false);
    });

    it("returns true when a PIN is set", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ withdrawalPinHash: "hashed:1234" });
      expect(await withdrawalPinService.hasWithdrawalPin("user_1")).toBe(true);
    });
  });

  describe("verifyWithdrawalPin", () => {
    it("rejects a malformed PIN before ever touching the database", async () => {
      await expect(withdrawalPinService.verifyWithdrawalPin("user_1", "12")).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("tells the user to set a PIN first if none exists yet — never silently passes", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", withdrawalPinHash: null });
      await expect(withdrawalPinService.verifyWithdrawalPin("user_1", "1234")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("accepts the correct PIN", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1", withdrawalPinHash: "hashed:1234", withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null,
      });
      await expect(withdrawalPinService.verifyWithdrawalPin("user_1", "1234")).resolves.toBeUndefined();
      // A correct entry with no prior failures doesn't even need a write.
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects an incorrect PIN and records the failed attempt", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1", withdrawalPinHash: "hashed:1234", withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null,
      });
      mockPrisma.user.update.mockResolvedValue({});

      await expect(withdrawalPinService.verifyWithdrawalPin("user_1", "9999")).rejects.toMatchObject({ statusCode: 401 });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { withdrawalPinFailedAttempts: 1 } });
    });

    it("locks the PIN after 5 consecutive failed attempts — real brute-force protection for a 4-digit PIN", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1", withdrawalPinHash: "hashed:1234", withdrawalPinFailedAttempts: 4, withdrawalPinLockedUntil: null,
      });
      mockPrisma.user.update.mockResolvedValue({});

      await expect(withdrawalPinService.verifyWithdrawalPin("user_1", "9999")).rejects.toMatchObject({ statusCode: 403 });

      const callArgs = mockPrisma.user.update.mock.calls[0][0];
      expect(callArgs.data.withdrawalPinFailedAttempts).toBe(5);
      expect(callArgs.data.withdrawalPinLockedUntil).toBeInstanceOf(Date);
      expect(callArgs.data.withdrawalPinLockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it("refuses EVEN THE CORRECT pin while locked out — a lock is a real lock, not just a counter", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1", withdrawalPinHash: "hashed:1234", withdrawalPinFailedAttempts: 5,
        withdrawalPinLockedUntil: new Date(Date.now() + 10 * 60 * 1000), // locked for 10 more minutes
      });

      await expect(withdrawalPinService.verifyWithdrawalPin("user_1", "1234")).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled(); // doesn't even attempt the check
    });

    it("a correct PIN after an EXPIRED lock succeeds and resets the failure count", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1", withdrawalPinHash: "hashed:1234", withdrawalPinFailedAttempts: 5,
        withdrawalPinLockedUntil: new Date(Date.now() - 1000), // lock already expired
      });
      mockPrisma.user.update.mockResolvedValue({});

      await expect(withdrawalPinService.verifyWithdrawalPin("user_1", "1234")).resolves.toBeUndefined();

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null },
      });
    });
  });
});
