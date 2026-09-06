"use strict";

const { z } = require("zod");

const createModuleSchema = z.object({
  params: z.object({ courseId: z.string().min(1) }),
  body: z.object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).optional(),
    position: z.coerce.number().int().min(0).optional(),
  }),
});

const updateModuleSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      title: z.string().trim().min(2).max(200).optional(),
      description: z.string().trim().max(5000).optional(),
      position: z.coerce.number().int().min(0).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided",
    }),
});

const moduleIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const reorderModulesSchema = z.object({
  params: z.object({ courseId: z.string().min(1) }),
  body: z.object({
    order: z
      .array(
        z.object({
          id: z.string().min(1),
          position: z.coerce.number().int().min(0),
        })
      )
      .min(1),
  }),
});

module.exports = {
  createModuleSchema,
  updateModuleSchema,
  moduleIdParamSchema,
  reorderModulesSchema,
};
