"use strict";

const { createPrismaMock } = require("../helpers/mockPrisma");

const mockPrisma = createPrismaMock();

jest.mock("../../src/database/client", () => ({ prisma: mockPrisma }));
jest.mock("../../src/config/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const mockSendNotification = jest.fn();
const mockSetVapidDetails = jest.fn();
jest.mock("web-push", () => ({
  setVapidDetails: (...args) => mockSetVapidDetails(...args),
  sendNotification: (...args) => mockSendNotification(...args),
}));

describe("webPush.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe("subscribe", () => {
    it("rejects a subscription missing required fields", async () => {
      jest.doMock("../../src/config/env", () => ({ config: { vapid: { publicKey: "", privateKey: "", subject: "" } } }));
      const webPushService = require("../../src/services/webPush.service");
      await expect(webPushService.subscribe("user_1", { endpoint: "https://x.com" })).rejects.toMatchObject({ statusCode: 400 });
    });

    it("saves a real subscription, upserting on the unique endpoint", async () => {
      jest.doMock("../../src/config/env", () => ({ config: { vapid: { publicKey: "", privateKey: "", subject: "" } } }));
      const webPushService = require("../../src/services/webPush.service");
      mockPrisma.pushSubscription.upsert.mockResolvedValue({ id: "sub_1" });

      await webPushService.subscribe("user_1", { endpoint: "https://push.example.com/abc", keys: { p256dh: "key1", auth: "auth1" } });

      expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: "https://push.example.com/abc" },
        update: { userId: "user_1", p256dh: "key1", auth: "auth1" },
        create: { userId: "user_1", endpoint: "https://push.example.com/abc", p256dh: "key1", auth: "auth1" },
      });
    });
  });

  describe("unsubscribe", () => {
    it("requires an endpoint", async () => {
      jest.doMock("../../src/config/env", () => ({ config: { vapid: { publicKey: "", privateKey: "", subject: "" } } }));
      const webPushService = require("../../src/services/webPush.service");
      await expect(webPushService.unsubscribe("user_1", undefined)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("only deletes the calling user's own subscription for that endpoint", async () => {
      jest.doMock("../../src/config/env", () => ({ config: { vapid: { publicKey: "", privateKey: "", subject: "" } } }));
      const webPushService = require("../../src/services/webPush.service");
      mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      await webPushService.unsubscribe("user_1", "https://push.example.com/abc");

      expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user_1", endpoint: "https://push.example.com/abc" },
      });
    });
  });

  describe("sendPushToUser", () => {
    it("gracefully skips (no crash) when VAPID keys are not configured", async () => {
      jest.doMock("../../src/config/env", () => ({ config: { vapid: { publicKey: "", privateKey: "", subject: "" } } }));
      const webPushService = require("../../src/services/webPush.service");

      const result = await webPushService.sendPushToUser("user_1", { title: "Hi", body: "Test" });

      expect(result).toEqual({ sent: 0 });
      expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
    });

    it("sends a real push to every one of the user's subscribed devices", async () => {
      jest.doMock("../../src/config/env", () => ({ config: { vapid: { publicKey: "pub", privateKey: "priv", subject: "mailto:x@x.com" } } }));
      const webPushService = require("../../src/services/webPush.service");
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        { id: "s1", endpoint: "https://a.com", p256dh: "k1", auth: "a1" },
        { id: "s2", endpoint: "https://b.com", p256dh: "k2", auth: "a2" },
      ]);
      mockSendNotification.mockResolvedValue({});

      const result = await webPushService.sendPushToUser("user_1", { title: "Cashback!", body: "You earned GH₵20" });

      expect(result.sent).toBe(2);
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });

    it("real cleanup: removes a subscription the browser has revoked (410), doesn't just retry forever", async () => {
      jest.doMock("../../src/config/env", () => ({ config: { vapid: { publicKey: "pub", privateKey: "priv", subject: "mailto:x@x.com" } } }));
      const webPushService = require("../../src/services/webPush.service");
      mockPrisma.pushSubscription.findMany.mockResolvedValue([{ id: "s1", endpoint: "https://a.com", p256dh: "k1", auth: "a1" }]);
      mockPrisma.pushSubscription.delete.mockResolvedValue({});
      const err = new Error("Gone"); err.statusCode = 410;
      mockSendNotification.mockRejectedValue(err);

      const result = await webPushService.sendPushToUser("user_1", { title: "Hi", body: "Test" });

      expect(result.sent).toBe(0);
      expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    });

    it("never throws to the caller even when the push service itself fails unexpectedly", async () => {
      jest.doMock("../../src/config/env", () => ({ config: { vapid: { publicKey: "pub", privateKey: "priv", subject: "mailto:x@x.com" } } }));
      const webPushService = require("../../src/services/webPush.service");
      mockPrisma.pushSubscription.findMany.mockResolvedValue([{ id: "s1", endpoint: "https://a.com", p256dh: "k1", auth: "a1" }]);
      mockSendNotification.mockRejectedValue(new Error("Network error"));

      await expect(webPushService.sendPushToUser("user_1", { title: "Hi", body: "Test" })).resolves.toEqual({ sent: 0 });
    });

    it("returns sent:0 immediately when the user has no subscriptions — never calls the push API", async () => {
      jest.doMock("../../src/config/env", () => ({ config: { vapid: { publicKey: "pub", privateKey: "priv", subject: "mailto:x@x.com" } } }));
      const webPushService = require("../../src/services/webPush.service");
      mockPrisma.pushSubscription.findMany.mockResolvedValue([]);

      const result = await webPushService.sendPushToUser("user_1", { title: "Hi", body: "Test" });

      expect(result).toEqual({ sent: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });
});
