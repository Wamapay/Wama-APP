"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));

const communityChatService = require("../../src/services/communityChat.service");

describe("communityChat.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("sendMessage", () => {
    it("rejects an empty message", async () => {
      await expect(communityChatService.sendMessage("user_1", "   ")).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.communityMessage.create).not.toHaveBeenCalled();
    });

    it("rejects a message over the max length", async () => {
      await expect(communityChatService.sendMessage("user_1", "x".repeat(1001))).rejects.toMatchObject({ statusCode: 400 });
    });

    it("creates a real, persisted message with the sender attached", async () => {
      mockPrisma.communityMessage.create.mockResolvedValue({
        id: "msg_1", userId: "user_1", message: "Hello everyone!",
        user: { id: "user_1", fullName: "Ama Serwaa", profileImage: null },
      });

      const result = await communityChatService.sendMessage("user_1", "  Hello everyone!  ");

      expect(mockPrisma.communityMessage.create).toHaveBeenCalledWith({
        data: { userId: "user_1", message: "Hello everyone!" }, // trimmed
        include: { user: { select: { id: true, fullName: true, profileImage: true } } },
      });
      expect(result.message).toBe("Hello everyone!");
    });
  });

  describe("listMessages", () => {
    it("with no cursor: returns the most recent page, in oldest-first (normal reading) order", async () => {
      mockPrisma.communityMessage.findMany.mockResolvedValue([
        { id: "m3", createdAt: new Date(3000) },
        { id: "m2", createdAt: new Date(2000) },
        { id: "m1", createdAt: new Date(1000) },
      ]);

      const result = await communityChatService.listMessages({});

      expect(mockPrisma.communityMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "desc" } })
      );
      expect(result.map((m) => m.id)).toEqual(["m1", "m2", "m3"]); // reversed to oldest-first
    });

    it("with a cursor: returns only messages created after that one, oldest-first", async () => {
      mockPrisma.communityMessage.findUnique.mockResolvedValue({ id: "m2", createdAt: new Date(2000) });
      mockPrisma.communityMessage.findMany.mockResolvedValue([{ id: "m3", createdAt: new Date(3000) }]);

      const result = await communityChatService.listMessages({ after: "m2" });

      expect(mockPrisma.communityMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdAt: { gt: new Date(2000) } }, orderBy: { createdAt: "asc" } })
      );
      expect(result.map((m) => m.id)).toEqual(["m3"]);
    });

    it("falls back gracefully when the cursor message was deleted between polls (e.g. by moderation)", async () => {
      mockPrisma.communityMessage.findUnique.mockResolvedValue(null);
      mockPrisma.communityMessage.findMany.mockResolvedValue([]);

      await expect(communityChatService.listMessages({ after: "deleted_msg" })).resolves.toEqual([]);
      // Never throws — a polling frontend shouldn't break just because
      // the message it last saw got moderated away.
    });
  });

  describe("deleteMessage (admin moderation)", () => {
    it("404s for a message that doesn't exist", async () => {
      mockPrisma.communityMessage.findUnique.mockResolvedValue(null);
      await expect(communityChatService.deleteMessage("ghost")).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.communityMessage.delete).not.toHaveBeenCalled();
    });

    it("really deletes the message (not a soft-hide) — a public chat room has no reason to keep spam/abuse around", async () => {
      mockPrisma.communityMessage.findUnique.mockResolvedValue({ id: "msg_1" });
      mockPrisma.communityMessage.delete.mockResolvedValue({});

      await communityChatService.deleteMessage("msg_1");

      expect(mockPrisma.communityMessage.delete).toHaveBeenCalledWith({ where: { id: "msg_1" } });
    });
  });
});
