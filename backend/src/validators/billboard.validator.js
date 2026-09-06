"use strict";

const { z } = require("zod");

const createFeaturedEntrySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    imageUrl: z.string().trim().url("imageUrl must be a valid URL").optional().nullable(),
    message: z.string().trim().min(1).max(300),
    durationDays: z.coerce.number().positive().max(90),
  }),
});

const entryIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

module.exports = { createFeaturedEntrySchema, entryIdParamSchema };
