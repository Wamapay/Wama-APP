"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/config/env", () => ({
  config: {
    isProduction: false,
    jwt: { accessExpiresIn: "15m", refreshExpiresIn: "7d" },
  },
}));
jest.mock("../../src/config/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock("../../src/utils/password", () => ({
  hashPassword: jest.fn(async (pw) => `hashed:${pw}`),
  verifyPassword: jest.fn(async (pw, hash) => hash === `hashed:${pw}`),
}));
jest.mock("../../src/utils/jwt", () => ({
  signAccessToken: jest.fn(() => "signed.jwt.token"),
}));
jest.mock("../../src/utils/secureToken", () => ({
  generateRawToken: jest.fn(() => "raw-token-value"),
  hashToken: jest.fn((raw) => `hash:${raw}`),
}));

const authService = require("../../src/services/auth.service");

describe("auth.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("rejects registration with an already-used email", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "existing_user" });

      await expect(
        authService.register({
          fullName: "Jane Doe",
          email: "jane@example.com",
          password: "password123",
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("creates the user with a hashed password and never stores the plain password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const txUser = { create: jest.fn().mockResolvedValue({ id: "user_1", email: "jane@example.com" }) };
      const txReferral = { create: jest.fn() };
      mockPrisma.$transaction.mockImplementation(async (cb) =>
        cb({ user: txUser, referral: txReferral })
      );

      const user = await authService.register({
        fullName: "Jane Doe",
        email: "jane@example.com",
        password: "password123",
      });

      expect(txUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          passwordHash: "hashed:password123",
          role: "USER",
          status: "ACTIVE",
        }),
      });
      const createCallData = txUser.create.mock.calls[0][0].data;
      expect(createCallData.password).toBeUndefined();
      expect(user.id).toBe("user_1");
      expect(txReferral.create).not.toHaveBeenCalled();
    });

    it("attributes a referral (status REGISTERED) when a valid referral code is supplied, without touching successfulReferrals", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.agent.findUnique.mockResolvedValue({ id: "agent_1", referralCode: "AGT10001" });

      const txUser = { create: jest.fn().mockResolvedValue({ id: "user_2" }) };
      const txReferral = { create: jest.fn().mockResolvedValue({}) };
      mockPrisma.$transaction.mockImplementation(async (cb) =>
        cb({ user: txUser, referral: txReferral })
      );

      await authService.register({
        fullName: "New User",
        email: "new@example.com",
        password: "password123",
        referralCode: "AGT10001",
      });

      expect(txReferral.create).toHaveBeenCalledWith({
        data: {
          agentId: "agent_1",
          referredUserId: "user_2",
          referralCode: "AGT10001",
          status: "REGISTERED",
        },
      });
      // Registration alone must never touch the Agent's successfulReferrals.
      expect(mockPrisma.agent.update).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("returns a generic error when the email does not exist (never reveals account existence)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ email: "ghost@example.com", password: "whatever123" })
      ).rejects.toMatchObject({ statusCode: 401, message: "Invalid email or password." });
    });

    it("returns the SAME generic error when the password is wrong", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1",
        passwordHash: "hashed:correct-password",
        status: "ACTIVE",
      });

      await expect(
        authService.login({ email: "jane@example.com", password: "wrong-password" })
      ).rejects.toMatchObject({ statusCode: 401, message: "Invalid email or password." });
    });

    it("rejects login for a suspended account", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1",
        passwordHash: "hashed:correct-password",
        status: "SUSPENDED",
      });

      await expect(
        authService.login({ email: "jane@example.com", password: "correct-password" })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("issues a token pair and updates lastLoginAt on success", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1",
        role: "USER",
        passwordHash: "hashed:correct-password",
        status: "ACTIVE",
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const { tokens } = await authService.login({
        email: "jane@example.com",
        password: "correct-password",
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { lastLoginAt: expect.any(Date) },
      });
      expect(tokens.accessToken).toBe("signed.jwt.token");
      expect(tokens.refreshToken).toBe("raw-token-value");
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: "user_1", tokenHash: "hash:raw-token-value" }),
      });
    });
  });

  describe("changePassword", () => {
    it("rejects an incorrect current password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1",
        passwordHash: "hashed:correct",
      });

      await expect(
        authService.changePassword("user_1", "wrong", "newpassword123")
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("updates the password hash and revokes all existing refresh tokens", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1",
        passwordHash: "hashed:correct",
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({});

      await authService.changePassword("user_1", "correct", "newpassword123");

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { passwordHash: "hashed:newpassword123" },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user_1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe("forgotPassword", () => {
    it("does not throw and does not create a token for an unknown email (prevents account enumeration)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await authService.forgotPassword("ghost@example.com");

      expect(result).toBeNull();
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });
});
