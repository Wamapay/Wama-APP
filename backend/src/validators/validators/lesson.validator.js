"use strict";

const { z } = require("zod");

// Deliberately does NOT include QUIZ/ASSESSMENT — the platform does not
// use quizzes or assessments (see platform business rules).
const LESSON_TYPES = ["VIDEO", "PDF", "AUDIO", "TEXT", "DOCUMENT", "IMAGE", "EXTERNAL_RESOURCE"];

const createLessonSchema = z.object({
  params: z.object({ moduleId: z.string().min(1) }),
  body: z.object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).optional(),
    type: z.enum(LESSON_TYPES).optional(),
    content: z.string().trim().max(5000).optional(),
    position: z.coerce.number().int().min(0).optional(),
    duration: z.coerce.number().int().min(0).optional(),
    isPreview: z.boolean().optional(),
  }),
});

const updateLessonSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      title: z.string().trim().min(2).max(200).optional(),
      description: z.string().trim().max(5000).optional(),
      type: z.enum(LESSON_TYPES).optional(),
      content: z.string().trim().max(5000).optional(),
      position: z.coerce.number().int().min(0).optional(),
      duration: z.coerce.number().int().min(0).optional(),
      isPreview: z.boolean().optional(),
      moduleId: z.string().trim().min(1).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided",
    }),
});

const lessonIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const reorderLessonsSchema = z.object({
  params: z.object({ moduleId: z.string().min(1) }),
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

const courseLessonParamSchema = z.object({
  params: z.object({
    courseId: z.string().min(1),
    lessonId: z.string().min(1),
  }),
});

module.exports = {
  LESSON_TYPES,
  createLessonSchema,
  updateLessonSchema,
  lessonIdParamSchema,
  reorderLessonsSchema,
  courseLessonParamSchema,
};
