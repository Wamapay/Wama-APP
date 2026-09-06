"use strict";

const { z } = require("zod");

const listNotificationsQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    unreadOnly: z.enum(["true", "false"]).optional(),
  }),
});

const notificationIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const sendNotificationSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(1).max(150),
      message: z.string().trim().min(1).max(2000),
      audience: z.enum(["USER", "AGENTS", "ALL"]),
      userId: z.string().trim().min(1).optional(),
    })
    .refine((body) => body.audience !== "USER" || !!body.userId, {
      message: "userId is required when audience is USER.",
      path: ["userId"],
    }),
});

module.exports = { listNotificationsQuerySchema, notificationIdParamSchema, sendNotificationSchema };
