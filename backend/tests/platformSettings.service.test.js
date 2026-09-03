"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));

const platformSettings = require("../../src/services/platformSettings.service");

describe("platformSettings.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.platformSettings.upsert.mockResolvedValue({
      id: "platform-settings-singleton",
      cashbackRatePercent: "20",
      commissionRatePercent: "40",
      verificationThreshold: 20,
      withdrawalFeeRatePercent: "5",
      rewardTiers: [
        { milestone: 10, amount: "50" },
        { milestone: 15, amount: "75" },
        { milestone: 20, amount: "100" },
      ],
      featuresEnabled: {
        courses: true,
        referrals: true,
        cashback: true,
        rewards: true,
        withdrawals: true,
        reviews: true,
      },
      visibleSections: {
        cashbackBalance: true,
        commissionBalance: true,
        rewardBalance: true,
        withdrawableBalance: true,
        transactionHistory: true,
        withdrawalSection: true,
        withdrawalMethods: true,
        referralSection: true,
        referralLink: true,
        referralStats: true,
        referralCommissionDisplay: true,
      },
      platformName: "Learn & Earn",
      logoUrl: null,
      tagline: null,
      supportEmail: null,
      supportPhone: null,
    });
  });

  describe("getSettings", () => {
    it("upserts a fixed-id row so a settings row always exists, even on the very first call", async () => {
      await platformSettings.getSettings();

      expect(mockPrisma.platformSettings.upsert).toHaveBeenCalledWith({
        where: { id: "platform-settings-singleton" },
        update: {},
        create: expect.objectContaining({ id: "platform-settings-singleton" }),
      });
    });

    it("returns the real default values matching the original hardcoded constants it replaces", async () => {
      const settings = await platformSettings.getSettings();
      expect(settings.cashbackRatePercent).toBe("20");
      expect(settings.commissionRatePercent).toBe("40");
      expect(settings.verificationThreshold).toBe(20);
      expect(settings.withdrawalFeeRatePercent).toBe("5");
      expect(settings.rewardTiers).toEqual([
        { milestone: 10, amount: "50" },
        { milestone: 15, amount: "75" },
        { milestone: 20, amount: "100" },
      ]);
    });
  });

  describe("updateSettings", () => {
    it("rejects a cashback rate above 100", async () => {
      await expect(platformSettings.updateSettings({ cashbackRatePercent: 150 }, "admin_1")).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.platformSettings.update).not.toHaveBeenCalled();
    });

    it("rejects a negative commission rate", async () => {
      await expect(platformSettings.updateSettings({ commissionRatePercent: -5 }, "admin_1")).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rejects a non-positive verification threshold", async () => {
      await expect(platformSettings.updateSettings({ verificationThreshold: 0 }, "admin_1")).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rejects an empty rewardTiers array", async () => {
      await expect(platformSettings.updateSettings({ rewardTiers: [] }, "admin_1")).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rejects reward tiers with a duplicate milestone", async () => {
      await expect(
        platformSettings.updateSettings(
          { rewardTiers: [{ milestone: 10, amount: "50" }, { milestone: 10, amount: "75" }] },
          "admin_1"
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a reward tier with a non-positive milestone", async () => {
      await expect(
        platformSettings.updateSettings({ rewardTiers: [{ milestone: 0, amount: "50" }] }, "admin_1")
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a reward tier amount that isn't a valid positive decimal string", async () => {
      await expect(
        platformSettings.updateSettings({ rewardTiers: [{ milestone: 10, amount: "not-a-number" }] }, "admin_1")
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("accepts a valid update and records which admin made it", async () => {
      mockPrisma.platformSettings.update.mockResolvedValue({
        id: "platform-settings-singleton",
        cashbackRatePercent: "25",
        updatedByAdminId: "admin_1",
      });

      const result = await platformSettings.updateSettings({ cashbackRatePercent: 25 }, "admin_1");

      expect(mockPrisma.platformSettings.update).toHaveBeenCalledWith({
        where: { id: "platform-settings-singleton" },
        data: { updatedByAdminId: "admin_1", cashbackRatePercent: "25" },
      });
      expect(result.cashbackRatePercent).toBe("25");
    });

    it("only touches the fields actually provided — a partial update never resets the others", async () => {
      mockPrisma.platformSettings.update.mockResolvedValue({});

      await platformSettings.updateSettings({ verificationThreshold: 25 }, "admin_1");

      const callArgs = mockPrisma.platformSettings.update.mock.calls[0][0];
      expect(callArgs.data).toEqual({ updatedByAdminId: "admin_1", verificationThreshold: 25 });
      expect(callArgs.data.cashbackRatePercent).toBeUndefined();
      expect(callArgs.data.commissionRatePercent).toBeUndefined();
    });

    it("rejects an unknown feature key instead of silently ignoring it", async () => {
      await expect(
        platformSettings.updateSettings({ featuresEnabled: { totallyMadeUp: false } }, "admin_1")
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.platformSettings.update).not.toHaveBeenCalled();
    });

    it("rejects a non-boolean feature value", async () => {
      await expect(
        platformSettings.updateSettings({ featuresEnabled: { withdrawals: "off" } }, "admin_1")
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("merges a partial featuresEnabled patch onto the CURRENT full set — toggling one never resets the others", async () => {
      mockPrisma.platformSettings.update.mockResolvedValue({});

      await platformSettings.updateSettings({ featuresEnabled: { withdrawals: false } }, "admin_1");

      const callArgs = mockPrisma.platformSettings.update.mock.calls[0][0];
      expect(callArgs.data.featuresEnabled).toEqual({
        courses: true, referrals: true, cashback: true, rewards: true, withdrawals: false, reviews: true,
      });
    });

    it("rejects an unknown section key for visibleSections", async () => {
      await expect(
        platformSettings.updateSettings({ visibleSections: { madeUpSection: false } }, "admin_1")
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.platformSettings.update).not.toHaveBeenCalled();
    });

    it("merges a partial visibleSections patch onto the current full set", async () => {
      mockPrisma.platformSettings.update.mockResolvedValue({});

      await platformSettings.updateSettings({ visibleSections: { rewardBalance: false } }, "admin_1");

      const callArgs = mockPrisma.platformSettings.update.mock.calls[0][0];
      expect(callArgs.data.visibleSections).toEqual({
        cashbackBalance: true, commissionBalance: true, rewardBalance: false, withdrawableBalance: true,
        transactionHistory: true, withdrawalSection: true, withdrawalMethods: true,
        referralSection: true, referralLink: true, referralStats: true, referralCommissionDisplay: true,
      });
    });
  });

  describe("isSectionVisible / getVisibleSectionsForUser (Financial Dashboard Control)", () => {
    it("defaults every section to visible", async () => {
      expect(await platformSettings.isSectionVisible("rewardBalance")).toBe(true);
    });

    it("respects a global visibleSections=false", async () => {
      mockPrisma.platformSettings.upsert.mockResolvedValueOnce({
        id: "platform-settings-singleton",
        visibleSections: { rewardBalance: false, cashbackBalance: true, commissionBalance: true, withdrawableBalance: true, transactionHistory: true, withdrawalSection: true, withdrawalMethods: true, referralSection: true, referralLink: true, referralStats: true, referralCommissionDisplay: true },
      });
      expect(await platformSettings.isSectionVisible("rewardBalance")).toBe(false);
    });

    it("a per-user override takes priority over the global value, in either direction", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ sectionOverrides: { rewardBalance: false } });
      expect(await platformSettings.isSectionVisible("rewardBalance", "user_1")).toBe(false);
    });

    it("getVisibleSectionsForUser returns the full merged map in one call", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ sectionOverrides: { withdrawalSection: false } });
      const result = await platformSettings.getVisibleSectionsForUser("user_1");
      expect(result).toEqual({
        cashbackBalance: true, commissionBalance: true, rewardBalance: true, withdrawableBalance: true,
        transactionHistory: true, withdrawalSection: false, withdrawalMethods: true,
        referralSection: true, referralLink: true, referralStats: true, referralCommissionDisplay: true,
      });
    });
  });

  describe("Platform Identity — name/logo/branding", () => {
    it("getPlatformIdentity returns ONLY the 5 identity fields, never rates/features", async () => {
      const identity = await platformSettings.getPlatformIdentity();
      expect(Object.keys(identity).sort()).toEqual(
        ["logoUrl", "platformName", "supportEmail", "supportPhone", "tagline"].sort()
      );
      expect(identity.platformName).toBe("Learn & Earn");
    });

    it("rejects clearing platformName to null — it must always be a real value", async () => {
      await expect(platformSettings.updateSettings({ platformName: null }, "admin_1")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects an empty-string platformName", async () => {
      await expect(platformSettings.updateSettings({ platformName: "" }, "admin_1")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a logoUrl that isn't a valid http(s) URL", async () => {
      await expect(platformSettings.updateSettings({ logoUrl: "not-a-url" }, "admin_1")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a supportEmail that isn't a valid email", async () => {
      await expect(platformSettings.updateSettings({ supportEmail: "not-an-email" }, "admin_1")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("accepts a valid full identity update", async () => {
      mockPrisma.platformSettings.update.mockResolvedValue({
        platformName: "New Brand", logoUrl: "https://cdn.example.com/logo.png", tagline: "Learn more, earn more",
      });
      const result = await platformSettings.updateSettings(
        { platformName: "New Brand", logoUrl: "https://cdn.example.com/logo.png", tagline: "Learn more, earn more" },
        "admin_1"
      );
      const callArgs = mockPrisma.platformSettings.update.mock.calls[0][0];
      expect(callArgs.data.platformName).toBe("New Brand");
      expect(callArgs.data.logoUrl).toBe("https://cdn.example.com/logo.png");
      expect(result.platformName).toBe("New Brand");
    });

    it("allows clearing an OPTIONAL identity field (e.g. tagline) to null", async () => {
      mockPrisma.platformSettings.update.mockResolvedValue({ tagline: null });
      await platformSettings.updateSettings({ tagline: null }, "admin_1");
      const callArgs = mockPrisma.platformSettings.update.mock.calls[0][0];
      expect(callArgs.data.tagline).toBeNull();
    });
  });
});
