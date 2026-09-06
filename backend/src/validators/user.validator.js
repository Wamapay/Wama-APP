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
      email: z.string().trim().toLowerCase().email("email must be a valid email address").optional(),
      // Only actually required when the email is genuinely changing —
      // the validator has no way to know the user's current email to
      // compare against, so that check happens in user.service.js
      // instead. Requiring it here whenever `email` is merely PRESENT
      // would break a form that re-submits the current, unchanged
      // email on every save (a very normal thing for a profile form
      // to do).
      currentPassword: z.string().min(1).optional(),
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

const setWithdrawalPinSchema = z.object({
  body: z.object({
    pin: z.string().regex(/^\d{4}$/, "pin must be exactly 4 digits"),
    currentPassword: z.string().min(1, "currentPassword is required"),
  }),
});

const deactivateAccountSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "currentPassword is required"),
  }),
});

module.exports = { updateProfileSchema, idParamSchema, setWithdrawalPinSchema, deactivateAccountSchema };
