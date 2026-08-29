"use strict";

const { z } = require("zod");
const { SLUG_PATTERN } = require("../utils/slugify");

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, "slug must be lowercase letters, numbers and hyphens only");

const COURSE_STATUSES = ["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"];

const createCourseSchema = z.object({
  body: z.object({
    title: z.string().trim().min(2).max(200),
    slug: slugSchema.optional(),
    description: z.string().trim().max(20000).optional(),
    shortDescription: z.string().trim().max(500).optional(),
    thumbnail: z.string().trim().url().optional(),
    coverImage: z.string().trim().url().optional(),
    // The backend stores the official price — never trusted from later
    // purchase requests, only set/changed here by an authorized Admin.
    price: z.coerce.number().min(0, "price must be zero or greater"),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    categoryId: z.string().trim().min(1).optional(),
    instructorId: z.string().trim().min(1).optional(),
    status: z.enum(COURSE_STATUSES).optional(),
    featured: z.boolean().optional(),
  }),
});

const updateCourseSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      title: z.string().trim().min(2).max(200).optional(),
      slug: slugSchema.optional(),
      description: z.string().trim().max(20000).optional(),
      shortDescription: z.string().trim().max(500).optional(),
      thumbnail: z.string().trim().url().optional(),
      coverImage: z.string().trim().url().optional(),
      price: z.coerce.number().min(0).optional(),
      currency: z.string().trim().toUpperCase().length(3).optional(),
      categoryId: z.string().trim().min(1).nullable().optional(),
      instructorId: z.string().trim().min(1).nullable().optional(),
      status: z.enum(COURSE_STATUSES).optional(),
      featured: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided",
    }),
});

const courseIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const courseSlugParamSchema = z.object({
  params: z.object({ slug: z.string().min(1) }),
});

const courseListQuerySchema = z.object({
  query: z.object({
    search: z.string().trim().max(200).optional(),
    category: z.string().trim().max(180).optional(),
    featured: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    status: z.enum(COURSE_STATUSES).optional(),
    sort: z.enum(["newest", "oldest", "price_asc", "price_desc", "title"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

module.exports = {
  COURSE_STATUSES,
  createCourseSchema,
  updateCourseSchema,
  courseIdParamSchema,
  courseSlugParamSchema,
  courseListQuerySchema,
};
