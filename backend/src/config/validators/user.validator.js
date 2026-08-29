"use strict";

const { z } = require("zod");

// Only fields a user is allowed to self-edit. role/status/verification/
// commission/etc. are deliberately absent — even if a client sends them,
// zod's default (strip unknown keys) behavior combined with never reading
// them in the service layer keeps this enforced server-side.
const updateProfileSchema = z.object({
  body: z
    .object({
      fullName: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().min(7).max(20).optional(),
      profileImage: z.string().trim().url("profileImage must be a valid URL").optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided",
    }),
});

const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

module.exports = { updateProfileSchema, idParamSchema };
