"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/utils/password", () => ({
  hashPassword: jest.fn(async (pw) => `hashed:${pw}`),
  verifyPassword: jest.fn(async (pw, hash) => hash === `hashed:${pw}`),
}));

const userService = require("../../src/services/user.service");

describe("user.service.updateProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.agent.findUnique.mockResolvedValue(null);
  });

  it("updates fullName/phone/profileImage directly — no password needed for these", async () => {
    mockPrisma.user.update.mockResolvedValue({ id: "user_1", fullName: "New Name" });

    await userService.updateProfile("user_1", { fullName: "New Name" });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { fullName: "New Name" } });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled(); // no password check needed at all for this path
  });

  describe("changing email — the safeguarded path", () => {
    it("requires the current password to be correct", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", email: "old@example.com", passwordHash: "hashed:correct-password" });

      await expect(
        userService.updateProfile("user_1", { email: "new@example.com", currentPassword: "wrong-password" })
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("refuses to change to an email already used by another account", async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: "user_1", email: "old@example.com", passwordHash: "hashed:correct-password" })
        .mockResolvedValueOnce({ id: "user_2", email: "taken@example.com" }); // the lookup for the NEW email

      await expect(
        userService.updateProfile("user_1", { email: "taken@example.com", currentPassword: "correct-password" })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("succeeds with the correct password and a genuinely free email", async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: "user_1", email: "old@example.com", passwordHash: "hashed:correct-password" })
        .mockResolvedValueOnce(null); // new email is free
      mockPrisma.user.update.mockResolvedValue({ id: "user_1", email: "new@example.com" });

      const result = await userService.updateProfile("user_1", { email: "new@example.com", currentPassword: "correct-password" });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { email: "new@example.com" } });
      expect(result.email).toBe("new@example.com");
    });

    it("never resets emailVerified — changing email must never silently lock someone out of their own account", async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: "user_1", email: "old@example.com", passwordHash: "hashed:correct-password" })
        .mockResolvedValueOnce(null);
      mockPrisma.user.update.mockResolvedValue({});

      await userService.updateProfile("user_1", { email: "new@example.com", currentPassword: "correct-password" });

      const callArgs = mockPrisma.user.update.mock.calls[0][0];
      expect(callArgs.data.emailVerified).toBeUndefined();
    });

    it("is a genuine no-op on the email field if the 'new' email is identical to the current one", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "user_1", email: "same@example.com", passwordHash: "hashed:correct-password" });
      mockPrisma.user.update.mockResolvedValue({});

      await userService.updateProfile("user_1", { email: "same@example.com", currentPassword: "correct-password" });

      // Only one findUnique call (the password check) — never looks up
      // "is this email taken" against itself.
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
      const callArgs = mockPrisma.user.update.mock.calls[0][0];
      expect(callArgs.data.email).toBeUndefined();
    });

    it("REGRESSION GUARD: a form that always re-submits the unchanged current email needs NO password at all — this must never break an ordinary profile save", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "user_1", email: "same@example.com", passwordHash: "hashed:some-password" });
      mockPrisma.user.update.mockResolvedValue({ id: "user_1", fullName: "New Name", email: "same@example.com" });

      // Note: NO currentPassword provided at all — exactly what a plain
      // "edit my name" form does when it also re-sends the unchanged email.
      const result = await userService.updateProfile("user_1", { fullName: "New Name", email: "same@example.com" });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user_1" },
        data: { fullName: "New Name" }, // email correctly excluded — never touched
      });
      expect(result.fullName).toBe("New Name");
    });
  });

  describe("Notification preferences — real, but honestly limited (no event system checks them yet)", () => {
    it("returns real defaults when the user has never set any preference", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ notificationPreferences: null });
      const prefs = await userService.getNotificationPreferences("user_1");
      expect(prefs.orderReceipts).toBe(true);
      expect(prefs.promotions).toBe(false);
    });

    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(userService.getNotificationPreferences("ghost")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects an unknown preference key", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ notificationPreferences: null });
      await expect(
        userService.updateNotificationPreferences("user_1", { smsWithdrawal: false })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a non-boolean value", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ notificationPreferences: null });
      await expect(
        userService.updateNotificationPreferences("user_1", { promotions: "yes" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("saves a real change and merges onto existing preferences — never resets the others", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ notificationPreferences: { weeklySummary: true } });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await userService.updateNotificationPreferences("user_1", { promotions: true });

      expect(result.promotions).toBe(true);
      expect(result.weeklySummary).toBe(true); // earlier real change preserved
      expect(result.orderReceipts).toBe(true); // untouched default preserved
      const callArgs = mockPrisma.user.update.mock.calls[0][0];
      expect(callArgs.data.notificationPreferences).toEqual(result);
    });
  });

  describe("Profile visibility — real, but honestly limited (no public profile/leaderboard exists yet)", () => {
    it("returns real defaults when never set", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ profileVisibility: null });
      const prefs = await userService.getProfileVisibility("user_1");
      expect(prefs.leaderboard).toBe(true);
    });

    it("rejects an unknown key", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ profileVisibility: null });
      await expect(
        userService.updateProfileVisibility("user_1", { madeUpKey: false })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("saves a real change, merging onto existing values", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ profileVisibility: { leaderboard: false } });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await userService.updateProfileVisibility("user_1", { certificateVisible: false });

      expect(result.certificateVisible).toBe(false);
      expect(result.leaderboard).toBe(false); // earlier change preserved
      expect(result.communityProfile).toBe(true); // untouched default preserved
    });
  });

  describe("deactivateAccount — real self-service deactivation", () => {
    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(userService.deactivateAccount("ghost", "pw")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("requires the correct current password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", passwordHash: "hashed:correct-password" });
      await expect(
        userService.deactivateAccount("user_1", "wrong-password")
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("sets a real deactivatedAt timestamp with the correct password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", passwordHash: "hashed:correct-password" });
      mockPrisma.user.update.mockResolvedValue({});

      const before = Date.now();
      await userService.deactivateAccount("user_1", "correct-password");

      const callArgs = mockPrisma.user.update.mock.calls[0][0];
      expect(callArgs.data.deactivatedAt).toBeInstanceOf(Date);
      expect(callArgs.data.deactivatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });
});
