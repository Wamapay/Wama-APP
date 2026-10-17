/**
 * Creator Store API — mounted at /api/v1/creator. Every route requires a
 * logged-in CREATOR account (requireCreator reads accountType from the
 * database), and every course/module/lesson is ownership-checked in
 * creator.service.js.
 */
"use strict";

const { Router } = require("express");
const authenticate = require("../middleware/authenticate");
const requireCreator = require("../middleware/requireCreator");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const uploadController = require("../controllers/upload.controller");
const controller = require("../controllers/creator.controller");
const { createCreatorCourseSchema, updateCreatorCourseSchema } = require("../validators/creator.validator");
const { courseIdParamSchema } = require("../validators/course.validator");
const { createModuleSchema, updateModuleSchema, moduleIdParamSchema } = require("../validators/module.validator");
const { createLessonSchema, updateLessonSchema, lessonIdParamSchema } = require("../validators/lesson.validator");

const router = Router();
router.use(authenticate, requireCreator);

router.get("/earnings", controller.earnings);

router.get("/courses", controller.listCourses);
router.post("/courses", validate(createCreatorCourseSchema), controller.createCourse);
router.get("/courses/:id", validate(courseIdParamSchema), controller.getCourse);
router.patch("/courses/:id", validate(updateCreatorCourseSchema), controller.updateCourse);
router.post("/courses/:id/submit", validate(courseIdParamSchema), controller.submit);
router.post("/courses/:id/unpublish", validate(courseIdParamSchema), controller.unpublish);
router.post("/courses/:id/republish", validate(courseIdParamSchema), controller.republish);

router.post("/courses/:courseId/modules", validate(createModuleSchema), controller.createModule);
router.patch("/modules/:id", validate(updateModuleSchema), controller.updateModule);
router.delete("/modules/:id", validate(moduleIdParamSchema), controller.deleteModule);

router.post("/modules/:moduleId/lessons", validate(createLessonSchema), controller.createLesson);
router.patch("/lessons/:id", validate(updateLessonSchema), controller.updateLesson);
router.delete("/lessons/:id", validate(lessonIdParamSchema), controller.deleteLesson);

/** Images / PDFs only (same rules as the admin uploader). */
router.post("/uploads", upload.single("file"), uploadController.uploadFile);

module.exports = router;
