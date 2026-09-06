"use strict";

/**
 * Notification routes. Every notification a user sees here was created
 * by an admin action (see admin.routes.js POST /admin/notifications) —
 * there is no system-generated notification type yet.
 */

const { Router } = require("express");
const notificationController = require("../controllers/notification.controller");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { listNotificationsQuerySchema, notificationIdParamSchema } = require("../validators/notification.validator");

const router = Router();

router.use(authenticate);

/** @route GET /api/v1/notifications @access Private (own notifications only) */
router.get("/", validate(listNotificationsQuerySchema), notificationController.listMine);

/** @route POST /api/v1/notifications/read-all @access Private */
router.post("/read-all", notificationController.markAllRead);

/** @route POST /api/v1/notifications/:id/read @access Private (own only) */
router.post("/:id/read", validate(notificationIdParamSchema), notificationController.markRead);

module.exports = router;
