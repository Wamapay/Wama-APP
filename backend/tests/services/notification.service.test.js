"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));

const notificationService = require("../../src/services/notification.service");

describe("notification.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("sendFromAdmin", () => {
    it("USER audience: requires a real userId and creates exactly one notification", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user_1" });
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await notificationService.sendFromAdmin({
        adminId: "admin_1",
        title: "Hi",
        message: "Hello there",
        audience: "USER",
        userId: "user_1",
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: { userId: "user_1", title: "Hi", message: "Hello there", sentByAdminId: "admin_1" },
      });
      expect(result).toEqual({ count: 1 });
    });

    it("USER audience: rejects when userId doesn't exist (404, not a silent no-op)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        notificationService.sendFromAdmin({ adminId: "admin_1", title: "Hi", message: "M", audience: "USER", userId: "ghost" })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it("USER audience: rejects with no userId supplied at all", async () => {
      await expect(
        notificationService.sendFromAdmin({ adminId: "admin_1", title: "Hi", message: "M", audience: "USER" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("AGENTS audience: sends exactly one notification per agent's user, not per user overall", async () => {
      mockPrisma.agent.findMany.mockResolvedValue([{ userId: "user_1" }, { userId: "user_2" }]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });

      const result = await notificationService.sendFromAdmin({
        adminId: "admin_1",
        title: "Agents only",
        message: "M",
        audience: "AGENTS",
      });

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          { userId: "user_1", title: "Agents only", message: "M", sentByAdminId: "admin_1" },
          { userId: "user_2", title: "Agents only", message: "M", sentByAdminId: "admin_1" },
        ],
      });
      expect(result).toEqual({ count: 2 });
    });

    it("ALL audience: sends to every user", async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: "user_1" }, { id: "user_2" }, { id: "user_3" }]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 3 });

      const result = await notificationService.sendFromAdmin({
        adminId: "admin_1",
        title: "Everyone",
        message: "M",
        audience: "ALL",
      });

      expect(mockPrisma.notification.createMany).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ count: 3 });
    });

    it("ALL/AGENTS audience: a genuinely empty recipient list is a real, harmless zero — not an error", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await notificationService.sendFromAdmin({
        adminId: "admin_1",
        title: "Everyone",
        message: "M",
        audience: "ALL",
      });

      expect(result).toEqual({ count: 0 });
      expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
    });

    it("rejects an unrecognized audience value", async () => {
      await expect(
        notificationService.sendFromAdmin({ adminId: "admin_1", title: "Hi", message: "M", audience: "EVERYONE_EVER" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("listForUser", () => {
    it("returns only the requesting user's own notifications, plus a real unread count", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([{ id: "n1" }]);
      mockPrisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const result = await notificationService.listForUser("user_1", {});

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user_1" } })
      );
      expect(result.unreadCount).toBe(1);
    });
  });

  describe("markRead", () => {
    it("marks a notification the user actually owns as read", async () => {
      mockPrisma.notification.findUnique.mockResolvedValue({ id: "n1", userId: "user_1" });
      mockPrisma.notification.update.mockResolvedValue({ id: "n1", isRead: true });

      const result = await notificationService.markRead("user_1", "n1");

      expect(mockPrisma.notification.update).toHaveBeenCalledWith({ where: { id: "n1" }, data: { isRead: true } });
      expect(result.isRead).toBe(true);
    });

    it("refuses to mark a notification belonging to a DIFFERENT user (404, not 403 — never confirms it exists)", async () => {
      mockPrisma.notification.findUnique.mockResolvedValue({ id: "n1", userId: "someone_else" });

      await expect(notificationService.markRead("user_1", "n1")).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.notification.update).not.toHaveBeenCalled();
    });

    it("returns 404 for a notification id that doesn't exist at all", async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(null);

      await expect(notificationService.markRead("user_1", "ghost")).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("markAllRead", () => {
    it("only updates the requesting user's own unread notifications", async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 4 });

      const result = await notificationService.markAllRead("user_1");

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: "user_1", isRead: false },
        data: { isRead: true },
      });
      expect(result).toEqual({ count: 4 });
    });
  });
});
