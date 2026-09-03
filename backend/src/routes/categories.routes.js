"use strict";

/**
 * Public category routes. Admin category management lives under
 * /api/v1/admin/categories (see admin.routes.js) — ordinary users can
 * never create/update/archive a category.
 */
const { Router } = require("express");
const categoryController = require("../controllers/category.controller");
const validate = require("../middleware/validate");
const { categorySlugParamSchema, categoryListQuerySchema } = require("../validators/category.validator");

const router = Router();

/** @route GET /api/v1/categories @access Public (ACTIVE categories only) */
router.get("/", validate(categoryListQuerySchema), categoryController.listCategories);

/** @route GET /api/v1/categories/:slug @access Public */
router.get("/:slug", validate(categorySlugParamSchema), categoryController.getCategory);

module.exports = router;
