"use strict";

const { z } = require("zod");
const { SLUG_PATTERN } = require("../utils/slugify");

const slugSchema = z.string().trim().toLowerCase().regex(SLUG_PATTERN, "slug must be lowercase letters, numbers and hyphens only");

const createCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    slug: slugSchema.optional(),
    description: z.string().trim().max(2000).optional(),
    image: z.string().trim().url("image must be a valid URL").optional(),
  }),
});

const updateCategorySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      slug: slugSchema.optional(),
      description: z.string().trim().max(2000).optional(),
      image: z.string().trim().url("image must be a valid URL").optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided",
    }),
});

const categoryIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const categorySlugParamSchema = z.object({
  params: z.object({ slug: z.string().min(1) }),
});

const categoryListQuerySchema = z.object({
  query: z.object({
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

module.exports = {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  categorySlugParamSchema,
  categoryListQuerySchema,
};
