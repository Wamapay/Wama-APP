"use strict";

const { z } = require("zod");

// Creators can only set these fields — status, featured, instructorId and
// approval are controlled by the platform.
const creatorCourseBody = {
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(20000).optional(),
  shortDescription: z.string().trim().max(500).optional(),
  thumbnail: z.string().trim().url().optional(),
  coverImage: z.string().trim().url().optional(),
  price: z.coerce.number().min(1, "Price must be at least 1"),
  categoryId: z.string().trim().min(1).optional(),
  kind: z.enum(["COURSE", "EBOOK"]).optional(),
  topics: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
};

const createCreatorCourseSchema = z.object({ body: z.object(creatorCourseBody).strip() });

const updateCreatorCourseSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      title: creatorCourseBody.title.optional(),
      description: creatorCourseBody.description,
      shortDescription: creatorCourseBody.shortDescription,
      thumbnail: creatorCourseBody.thumbnail,
      coverImage: creatorCourseBody.coverImage,
      price: creatorCourseBody.price.optional(),
      categoryId: z.string().trim().min(1).nullable().optional(),
      topics: creatorCourseBody.topics,
    })
    .strip()
    .refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" }),
});

const rejectCourseSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ reason: z.string().trim().min(3, "Give the creator a reason").max(1000) }),
});

module.exports = { createCreatorCourseSchema, updateCreatorCourseSchema, rejectCourseSchema };
