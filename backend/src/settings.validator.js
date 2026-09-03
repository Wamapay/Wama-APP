"use strict";

const { z } = require("zod");

const rewardTierSchema = z.object({
  milestone: z.number().int().positive(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount must be a positive number as a string, e.g. \"50\" or \"50.00\""),
});

const updateSettingsSchema = z.object({
  body: z
    .object({
      cashbackRatePercent: z.number().min(0).max(100).optional(),
      commissionRatePercent: z.number().min(0).max(100).optional(),
      verificationThreshold: z.number().int().positive().optional(),
      withdrawalFeeRatePercent: z.number().min(0).max(100).optional(),
      rewardTiers: z.array(rewardTierSchema).min(1).optional(),
      // Shape-only check here (any string key -> boolean value). Whether
      // a given key is actually a REAL, known feature name is checked in
      // platformSettings.service.js against FEATURE_KEYS — the single
      // source of truth for that list, so it's not duplicated here.
      featuresEnabled: z.record(z.string(), z.boolean()).optional(),
      visibleSections: z.record(z.string(), z.boolean()).optional(),
      // Platform identity/branding — shape-only here (real validation,
      // including the URL/email format checks, happens in
      // platformSettings.service.js).
      platformName: z.string().min(1).max(300).optional(),
      logoUrl: z.string().max(300).nullable().optional(),
      tagline: z.string().max(300).nullable().optional(),
      supportEmail: z.string().max(300).nullable().optional(),
      supportPhone: z.string().max(300).nullable().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, "Provide at least one setting to update."),
});

module.exports = { updateSettingsSchema };
