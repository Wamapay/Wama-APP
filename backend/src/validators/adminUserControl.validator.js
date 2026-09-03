"use strict";

const { z } = require("zod");

const idParamSchema = z.object({ params: z.object({ id: z.string().min(1) }) });

const courseAccessSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ courseId: z.string().min(1) }),
});

const revokeCourseAccessSchema = z.object({
  params: z.object({ id: z.string().min(1), courseId: z.string().min(1) }),
});

const adjustBalanceSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    balanceType: z.enum(["CASHBACK", "COMMISSION", "REWARD"]),
    // A string, not a number: user-provided money values are parsed via
    // the same Decimal-safe toDecimal() the rest of the app uses,
    // exactly like every other money field in this API — never a raw
    // JS float. Sign (+/-) is the caller's intent: credit vs debit.
    amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/, "amount must be a number like \"50\" or \"-20.50\""),
    reason: z.string().trim().min(1).max(500),
  }),
});

const userFeatureOverridesSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    // Shape-only here; FEATURE_KEYS validation happens in
    // platformSettings.service.js, same split as the global settings
    // endpoint. `null` clears an override back to "inherit global".
    overrides: z.record(z.string(), z.union([z.boolean(), z.null()])),
  }),
});

const userSectionOverridesSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    overrides: z.record(z.string(), z.union([z.boolean(), z.null()])),
  }),
});

const setAdminRoleSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    role: z.enum(["USER", "AGENT", "ADMIN", "SUPER_ADMIN", "FINANCE_ADMIN", "CONTENT_ADMIN", "LEARNING_ADMIN", "CUSTOMER_SUPPORT", "MARKETING_ADMIN"]),
  }),
});

module.exports = {
  idParamSchema,
  courseAccessSchema,
  revokeCourseAccessSchema,
  adjustBalanceSchema,
  userFeatureOverridesSchema,
  userSectionOverridesSchema,
  setAdminRoleSchema,
};
