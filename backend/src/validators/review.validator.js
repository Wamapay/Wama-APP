"use strict";

const { z } = require("zod");

const upsertReviewSchema = z.object({
  params: z.object({ courseId: z.string().min(1) }),
  body: z.object({
    rating: z.coerce.number().int().min(1, "rating must be between 1 and 5").max(5, "rating must be between 1 and 5"),
    title: z.string().trim().max(200).optional(),
    comment: z.string().trim().max(5000).optional(),
  }),
});

const courseReviewsParamSchema = z.object({
  params: z.object({ courseId: z.string().min(1) }),
});

const reviewIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

module.exports = { upsertReviewSchema, courseReviewsParamSchema, reviewIdParamSchema };
