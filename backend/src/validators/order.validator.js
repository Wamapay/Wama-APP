"use strict";

const { z } = require("zod");

// The client may ONLY provide the courseId (+ optional referral code).
// It must never be able to supply amount/cashbackAmount/commissionAmount —
// those fields are intentionally absent here, and even if sent, zod's
// default strip-unknown-keys behavior plus the service layer only ever
// reading `courseId`/`referralCode` keeps this enforced server-side.
const createOrderSchema = z.object({
  body: z.object({
    courseId: z.string().trim().min(1, "courseId is required"),
    referralCode: z.string().trim().min(1).max(40).optional(),
  }),
});

const orderIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const orderListQuerySchema = z.object({
  query: z.object({
    status: z.enum(["PENDING", "PAID", "FAILED", "CANCELLED"]).optional(),
    paymentStatus: z.enum(["PENDING", "SUCCESSFUL", "FAILED"]).optional(),
    courseId: z.string().trim().min(1).optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const adminOrderListQuerySchema = z.object({
  query: z.object({
    search: z.string().trim().max(200).optional(),
    status: z.enum(["PENDING", "PAID", "FAILED", "CANCELLED"]).optional(),
    paymentStatus: z.enum(["PENDING", "SUCCESSFUL", "FAILED"]).optional(),
    courseId: z.string().trim().min(1).optional(),
    userId: z.string().trim().min(1).optional(),
    agentId: z.string().trim().min(1).optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

module.exports = {
  createOrderSchema,
  orderIdParamSchema,
  orderListQuerySchema,
  adminOrderListQuerySchema,
};
