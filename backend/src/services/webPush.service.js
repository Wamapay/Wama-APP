/**
 * Real Web Push notifications. Free, open web standard — no SMS/push
 * vendor needed. Optional: without VAPID keys configured, sendPushToUser
 * simply skips sending (logs why) rather than crashing anything that
 * calls it — same graceful-degradation pattern as Cloudinary/Redis.
 */
"use strict";

const webpush = require("web-push");
const { prisma } = require("../database/client");
const { config } = require("../config/env");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!config.vapid.publicKey || !config.vapid.privateKey) return false;
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
  configured = true;
  return true;
}

async function subscribe(userId, subscription) {
  const { endpoint, keys } = subscription || {};
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    throw ApiError.badRequest("A valid push subscription (endpoint + keys.p256dh + keys.auth) is required.");
  }

  // Real upsert on the unique endpoint — the same browser/device
  // re-subscribing (e.g. after clearing data) just updates its keys
  // rather than creating a duplicate row.
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
}

async function unsubscribe(userId, endpoint) {
  if (!endpoint) {
    throw ApiError.badRequest("endpoint is required.");
  }
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return { unsubscribed: true };
}

/**
 * Sends a real push to every device a user has subscribed on. Never
 * throws for the CALLER's sake — a push failure must never break the
 * real, already-working in-app notification it rides alongside. A
 * subscription the browser has revoked (410/404 from the push service)
 * is cleaned up automatically rather than retried forever.
 */
async function sendPushToUser(userId, { title, body, url }) {
  if (!ensureConfigured()) {
    logger.info("[webPush] VAPID keys not configured — skipping push (in-app notification still sent).");
    return { sent: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return { sent: 0 };

  const payload = JSON.stringify({ title, body, url: url || "/" });

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // The browser itself revoked this subscription — real
          // cleanup, not a retry-worthy transient failure.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          logger.error(`[webPush] Failed to send to a subscription: ${err.message}`);
        }
      }
    })
  );

  return { sent };
}

module.exports = { subscribe, unsubscribe, sendPushToUser };
