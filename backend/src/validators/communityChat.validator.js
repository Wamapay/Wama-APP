"use strict";

const { z } = require("zod");

const listMessagesQuerySchema = z.object({
  query: z.object({
    after: z.string().min(1).optional(),
    limit: z.string().optional(),
  }),
});

const sendMessageSchema = z.object({
  body: z.object({
    message: z.string().trim().min(1, "Message cannot be empty").max(1000, "Message is too long (max 1000 characters)"),
  }),
});

const messageIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

module.exports = { listMessagesQuerySchema, sendMessageSchema, messageIdParamSchema };
