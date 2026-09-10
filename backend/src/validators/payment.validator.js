"use strict";

const { z } = require("zod");

// The client may ONLY provide orderId — amount/currency/status are always
// server-derived from the order. See payment.service.js.
const initializePaymentSchema = z.object({
  body: z.object({
    orderId: z.string().trim().min(1, "orderId is required"),
  }),
});

const referenceParamSchema = z.object({
  params: z.object({ reference: z.string().trim().min(1) }),
});

const paymentListQuerySchema = z.object({
  query: z.object({
    status: z.enum(["INITIALIZED", "PENDING", "SUCCESSFUL", "FAILED", "CANCELLED"]).optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const adminPaymentListQuerySchema = z.object({
  query: z.object({
    search: z.string().trim().max(200).optional(),
    status: z.enum(["INITIALIZED", "PENDING", "SUCCESSFUL", "FAILED", "CANCELLED"]).optional(),
    userId: z.string().trim().min(1).optional(),
    orderId: z.string().trim().min(1).optional(),
    courseId: z.string().trim().min(1).optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

module.exports = {
  initializePaymentSchema,
  referenceParamSchema,
  paymentListQuerySchema,
  adminPaymentListQuerySchema,
};
