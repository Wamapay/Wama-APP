"use strict";

const { createPrismaMock, withDefaultTransaction } = require("../helpers/mockPrisma");

const mockPrisma = withDefaultTransaction(createPrismaMock());

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/services/admin.service", () => ({
  logAdminActivity: jest.fn().mockResolvedValue(undefined),
}));

const adminUserControl = require("../../src/services/adminUserControl.service");
const { logAdminActivity } = require("../../src/services/admin.service");

function mockLedgerPrimitives() {
  mockPrisma.transaction.findFirst.mockResolvedValue(null);
  mockPrisma.transaction.count.mockResolvedValue(0);
  mockPrisma.transaction.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: `txn_${Math.random().toString(36).slice(2)}`, ...data })
  );
  mockPrisma.user.update.mockResolvedValue({});
}

describe("adminUserControl.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withDefaultTransaction(mockPrisma);
  });

  describe("grantCourseAccess", () => {
    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        adminUserControl.grantCourseAccess({ adminId: "admin_1", userId: "ghost", courseId: "course_1" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("404s for a course that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1" });
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(
        adminUserControl.grantCourseAccess({ adminId: "admin_1", userId: "user_1", courseId: "ghost" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("creates a real enrollment with orderId null (admin-granted, not paid) and logs the action", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1" });
      mockPrisma.course.findUnique.mockResolvedValue({ id: "course_1" });
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      mockPrisma.enrollment.create.mockImplementation(({ data }) => Promise.resolve({ id: "enr_1", ...data }));

      const enrollment = await adminUserControl.grantCourseAccess({ adminId: "admin_1", userId: "user_1", courseId: "course_1" });

      expect(mockPrisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: "user_1", courseId: "course_1", orderId: null }) })
      );
      expect(enrollment.orderId).toBeNull();
      expect(logAdminActivity).toHaveBeenCalledWith({
        adminId: "admin_1", action: "GRANT_COURSE_ACCESS", targetType: "Enrollment", targetId: "enr_1",
      });
    });
  });

  describe("revokeCourseAccess", () => {
    it("404s when there is no enrollment at all", async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      await expect(
        adminUserControl.revokeCourseAccess({ adminId: "admin_1", userId: "user_1", courseId: "course_1" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("refuses to revoke access that was actually paid for (orderId set) — the core safety rule", async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ id: "enr_1", orderId: "order_1", status: "ACTIVE" });
      await expect(
        adminUserControl.revokeCourseAccess({ adminId: "admin_1", userId: "user_1", courseId: "course_1" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.enrollment.update).not.toHaveBeenCalled();
    });

    it("suspends (never deletes) admin-granted access (orderId null) and logs it", async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ id: "enr_1", orderId: null, status: "ACTIVE" });
      mockPrisma.enrollment.update.mockResolvedValue({ id: "enr_1", status: "SUSPENDED" });

      const result = await adminUserControl.revokeCourseAccess({ adminId: "admin_1", userId: "user_1", courseId: "course_1" });

      expect(mockPrisma.enrollment.update).toHaveBeenCalledWith({ where: { id: "enr_1" }, data: { status: "SUSPENDED" } });
      expect(result.status).toBe("SUSPENDED");
      expect(logAdminActivity).toHaveBeenCalledWith({
        adminId: "admin_1", action: "REVOKE_COURSE_ACCESS", targetType: "Enrollment", targetId: "enr_1",
      });
    });
  });

  describe("adjustBalance", () => {
    it("requires a non-empty reason", async () => {
      await expect(
        adminUserControl.adjustBalance({ adminId: "admin_1", userId: "user_1", balanceType: "CASHBACK", amount: "50", reason: "  " })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a zero amount", async () => {
      await expect(
        adminUserControl.adjustBalance({ adminId: "admin_1", userId: "user_1", balanceType: "CASHBACK", amount: "0", reason: "test" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects an invalid balanceType", async () => {
      await expect(
        adminUserControl.adjustBalance({ adminId: "admin_1", userId: "user_1", balanceType: "SAVINGS", amount: "50", reason: "test" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        adminUserControl.adjustBalance({ adminId: "admin_1", userId: "ghost", balanceType: "CASHBACK", amount: "50", reason: "test" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("a positive amount credits the balance via the real ledger, with reason+admin recorded", async () => {
      mockLedgerPrimitives();
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", cashbackBalance: 100 });

      const txn = await adminUserControl.adjustBalance({
        adminId: "admin_1", userId: "user_1", balanceType: "CASHBACK", amount: "50", reason: "Goodwill credit",
      });

      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "ADMIN_ADJUSTMENT",
            amount: expect.anything(),
            metadata: { reason: "Goodwill credit", adjustedByAdminId: "admin_1", direction: "CREDIT" },
          }),
        })
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { cashbackBalance: { increment: expect.anything() } } });
      expect(logAdminActivity).toHaveBeenCalledWith({ adminId: "admin_1", action: "ADJUST_BALANCE", targetType: "User", targetId: "user_1" });
      expect(txn.amount.toString()).toBe("50");
    });

    it("a negative amount debits the balance when there's enough to cover it", async () => {
      mockLedgerPrimitives();
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", cashbackBalance: 100 });

      await adminUserControl.adjustBalance({
        adminId: "admin_1", userId: "user_1", balanceType: "CASHBACK", amount: "-30", reason: "Correcting an error",
      });

      const callArgs = mockPrisma.transaction.create.mock.calls[0][0];
      expect(callArgs.data.metadata.direction).toBe("DEBIT");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { cashbackBalance: { increment: expect.anything() } } });
      // The applied delta is negative — verify via the actual Decimal passed.
      const deltaArg = mockPrisma.user.update.mock.calls[0][0].data.cashbackBalance.increment;
      expect(deltaArg.toString()).toBe("-30");
    });

    it("refuses a debit that would take the balance negative — never silently allows an overdraft", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", cashbackBalance: 20 });

      await expect(
        adminUserControl.adjustBalance({ adminId: "admin_1", userId: "user_1", balanceType: "CASHBACK", amount: "-50", reason: "test" })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe("setUserFeatureOverrides", () => {
    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        adminUserControl.setUserFeatureOverrides({ adminId: "admin_1", userId: "ghost", overrides: { withdrawals: false } })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects an unknown feature key", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", featureOverrides: null });
      await expect(
        adminUserControl.setUserFeatureOverrides({ adminId: "admin_1", userId: "user_1", overrides: { madeUp: false } })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("sets a real per-user override and logs the action", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", featureOverrides: null });
      mockPrisma.user.update.mockResolvedValue({ id: "user_1", featureOverrides: { withdrawals: false } });

      const result = await adminUserControl.setUserFeatureOverrides({
        adminId: "admin_1", userId: "user_1", overrides: { withdrawals: false },
      });

      expect(result.featureOverrides).toEqual({ withdrawals: false });
      expect(logAdminActivity).toHaveBeenCalledWith({
        adminId: "admin_1", action: "SET_USER_FEATURE_OVERRIDES", targetType: "User", targetId: "user_1",
      });
    });

    it("clearing an override with null removes it rather than storing null forever", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", featureOverrides: { withdrawals: false, reviews: false } });
      mockPrisma.user.update.mockResolvedValue({});

      await adminUserControl.setUserFeatureOverrides({ adminId: "admin_1", userId: "user_1", overrides: { withdrawals: null } });

      const callArgs = mockPrisma.user.update.mock.calls[0][0];
      expect(callArgs.data.featureOverrides).toEqual({ reviews: false });
    });
  });

  describe("setUserSectionOverrides (Financial Dashboard Control, Part 4)", () => {
    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        adminUserControl.setUserSectionOverrides({ adminId: "admin_1", userId: "ghost", overrides: { rewardBalance: false } })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects an unknown section key", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", sectionOverrides: null });
      await expect(
        adminUserControl.setUserSectionOverrides({ adminId: "admin_1", userId: "user_1", overrides: { madeUp: false } })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("sets a real per-user visibility override and logs the action", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", sectionOverrides: null });
      mockPrisma.user.update.mockResolvedValue({ id: "user_1", sectionOverrides: { rewardBalance: false } });

      const result = await adminUserControl.setUserSectionOverrides({
        adminId: "admin_1", userId: "user_1", overrides: { rewardBalance: false },
      });

      expect(result.sectionOverrides).toEqual({ rewardBalance: false });
      expect(logAdminActivity).toHaveBeenCalledWith({
        adminId: "admin_1", action: "SET_USER_SECTION_OVERRIDES", targetType: "User", targetId: "user_1",
      });
    });
  });

  describe("setUserRole (Part 15 — admin role assignment)", () => {
    it("404s for a user that doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        adminUserControl.setUserRole({ actingAdminId: "admin_1", actingAdminRole: "SUPER_ADMIN", userId: "ghost", role: "FINANCE_ADMIN" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("a plain ADMIN can assign a specialized role like FINANCE_ADMIN", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", role: "USER" });
      mockPrisma.user.update.mockResolvedValue({ id: "user_1", role: "FINANCE_ADMIN" });

      const result = await adminUserControl.setUserRole({
        actingAdminId: "admin_1", actingAdminRole: "ADMIN", userId: "user_1", role: "FINANCE_ADMIN",
      });

      expect(result.role).toBe("FINANCE_ADMIN");
      expect(logAdminActivity).toHaveBeenCalledWith({ adminId: "admin_1", action: "SET_USER_ROLE", targetType: "User", targetId: "user_1" });
    });

    it("the core safeguard: a plain ADMIN (not SUPER_ADMIN) cannot grant SUPER_ADMIN to anyone", async () => {
      await expect(
        adminUserControl.setUserRole({ actingAdminId: "admin_1", actingAdminRole: "ADMIN", userId: "user_1", role: "SUPER_ADMIN" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("an existing SUPER_ADMIN CAN grant SUPER_ADMIN to someone else", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1", role: "ADMIN" });
      mockPrisma.user.update.mockResolvedValue({ id: "user_1", role: "SUPER_ADMIN" });

      const result = await adminUserControl.setUserRole({
        actingAdminId: "super_1", actingAdminRole: "SUPER_ADMIN", userId: "user_1", role: "SUPER_ADMIN",
      });
      expect(result.role).toBe("SUPER_ADMIN");
    });

    it("a SUPER_ADMIN cannot demote their OWN account away from SUPER_ADMIN", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "super_1", role: "SUPER_ADMIN" });
      await expect(
        adminUserControl.setUserRole({ actingAdminId: "super_1", actingAdminRole: "SUPER_ADMIN", userId: "super_1", role: "ADMIN" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
