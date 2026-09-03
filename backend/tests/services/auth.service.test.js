"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/config/env", () => ({
  config: {
    isProduction: false,
    jwt: { accessExpiresIn: "15m", refreshExpiresIn: "7d" },
    frontendUrl: "https://app.example.com",
    email: { resendApiKey: "re_test_key", from: "Learn & Earn <onboarding@resend.dev>" },
  },
}));
jest.mock("../../src/config/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock("../../src/services/email.service", () => ({
  sendVerificationEmail: jest.fn(async () => ({ sent: true })),
}));
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

    it("rejects login for an unverified account", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1",
        passwordHash: "hashed:correct-password",
        status: "ACTIVE",
        emailVerified: false,
      });

      await expect(
        authService.login({ email: "jane@example.com", password: "correct-password" })
      ).rejects.toMatchObject({ statusCode: 403, message: "Please verify your email before logging in." });
    });

    it("issues a token pair and updates lastLoginAt on success", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user_1",
        role: "USER",
        passwordHash: "hashed:correct-password",
        status: "ACTIVE",
        emailVerified: true,
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

  describe("issueEmailVerificationToken", () => {
    const emailService = require("../../src/services/email.service");

    it("creates a token and sends it via the real email service, using the frontend verification route", async () => {
      mockPrisma.emailVerificationToken.create.mockResolvedValue({});
      emailService.sendVerificationEmail.mockResolvedValueOnce({ sent: true });

      const user = { id: "user_1", email: "jane@example.com", fullName: "Jane Doe" };
      const result = await authService.issueEmailVerificationToken(user);

      expect(mockPrisma.emailVerificationToken.create).toHaveBeenCalledWith({
        data: { userId: "user_1", tokenHash: "hash:raw-token-value", expiresAt: expect.any(Date) },
      });
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith({
        to: "jane@example.com",
        fullName: "Jane Doe",
        verificationUrl: "https://app.example.com/#/verify-email?token=raw-token-value",
      });
      expect(result).toEqual({ rawToken: "raw-token-value", emailSent: true });
    });

    it("invalidates any previously-issued, still-valid tokens for the same user before creating a new one", async () => {
      mockPrisma.emailVerificationToken.create.mockResolvedValue({});
      emailService.sendVerificationEmail.mockResolvedValueOnce({ sent: true });

      await authService.issueEmailVerificationToken({ id: "user_1", email: "a@example.com" });

      expect(mockPrisma.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user_1", usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it("still creates a real, usable token even if the email provider fails — never leaves the account unusable", async () => {
      mockPrisma.emailVerificationToken.create.mockResolvedValue({});
      emailService.sendVerificationEmail.mockResolvedValueOnce({ sent: false });

      const result = await authService.issueEmailVerificationToken({ id: "user_1", email: "a@example.com" });

      expect(mockPrisma.emailVerificationToken.create).toHaveBeenCalled(); // token persisted regardless
      expect(result.emailSent).toBe(false);
      expect(result.rawToken).toBe("raw-token-value"); // caller can still act on it if needed
    });
  });

  describe("resendVerification", () => {
    it("is a silent no-op for an unknown email (never reveals account existence)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await authService.resendVerification("ghost@example.com");

      expect(result).toBeNull();
      expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });

    it("is a silent no-op for an already-verified account (never reveals verification state)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", email: "a@example.com", emailVerified: true });

      const result = await authService.resendVerification("a@example.com");

      expect(result).toBeNull();
      expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });

    it("issues a fresh token for a real, unverified account", async () => {
      const emailService = require("../../src/services/email.service");
      emailService.sendVerificationEmail.mockResolvedValueOnce({ sent: true });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", email: "a@example.com", fullName: "A", emailVerified: false });
      mockPrisma.emailVerificationToken.create.mockResolvedValue({});

      const result = await authService.resendVerification("a@example.com");

      expect(result.emailSent).toBe(true);
    });
  });

  describe("verifyEmail", () => {
    it("rejects a token that doesn't exist", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(authService.verifyEmail("bogus-token")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects an expired token", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: "evt_1", userId: "user_1", usedAt: null,
        expiresAt: new Date(Date.now() - 1000), // already in the past
      });

      await expect(authService.verifyEmail("raw-token-value")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a token that has already been used (single-use)", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: "evt_1", userId: "user_1", usedAt: new Date(), // already used
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      await expect(authService.verifyEmail("raw-token-value")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("marks the user verified and the token used, for a valid token", async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: "evt_1", userId: "user_1", usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.emailVerificationToken.update.mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (arr) => Promise.all(arr));

      await authService.verifyEmail("raw-token-value");

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { emailVerified: true },
      });
      expect(mockPrisma.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: "evt_1" },
        data: { usedAt: expect.any(Date) },
      });
    });
  });
});
