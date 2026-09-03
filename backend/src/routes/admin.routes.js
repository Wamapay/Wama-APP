"use strict";

/**
 * Admin routes.
 *  - Stage 2: user + agent visibility and suspend/activate.
 *  - Stage 3: course/category/module/lesson management, order visibility
 *    (read-only — no refund/cancellation endpoints exist anywhere), and
 *    review moderation.
 *  - Stage 4: read-only financial visibility (transactions, reports,
 *    reconciliation) plus a controlled, auditable withdrawal
 *    approve/reject/complete pipeline. No endpoint anywhere lets an
 *    Admin directly edit a balance.
 * Deletion of users/agents remains intentionally out of scope — see
 * Backend Stage 9 (Admin Operations).
 */
const { Router } = require("express");
const adminController = require("../controllers/admin.controller");
const adminCourseController = require("../controllers/admin.course.controller");
const authenticate = require("../middleware/authenticate");
const { requireRole } = require("../middleware/authorize");
const validate = require("../middleware/validate");
const { idParamSchema } = require("../validators/user.validator");
const {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  categoryListQuerySchema,
} = require("../validators/category.validator");
const {
  createCourseSchema,
  updateCourseSchema,
  courseIdParamSchema,
  courseListQuerySchema,
} = require("../validators/course.validator");
const { createModuleSchema, updateModuleSchema, moduleIdParamSchema, reorderModulesSchema } = require("../validators/module.validator");
const { createLessonSchema, updateLessonSchema, lessonIdParamSchema, reorderLessonsSchema } = require("../validators/lesson.validator");
const { orderIdParamSchema, adminOrderListQuerySchema } = require("../validators/order.validator");
const { reviewIdParamSchema } = require("../validators/review.validator");
const {
  withdrawalIdParamSchema,
  adminWithdrawalListQuerySchema,
  rejectWithdrawalSchema,
  completeWithdrawalSchema,
  adminTransactionListQuerySchema,
  adminReportQuerySchema,
} = require("../validators/financial.validator");
const withdrawalController = require("../controllers/withdrawal.controller");
const adminFinanceController = require("../controllers/adminFinance.controller");
const paymentController = require("../controllers/payment.controller");
const { referenceParamSchema, adminPaymentListQuerySchema } = require("../validators/payment.validator");
const { updateSettingsSchema } = require("../validators/settings.validator");
const { sendNotificationSchema } = require("../validators/notification.validator");
const {
  courseAccessSchema,
  revokeCourseAccessSchema,
  adjustBalanceSchema,
  userFeatureOverridesSchema,
  userSectionOverridesSchema,
  setAdminRoleSchema,
} = require("../validators/adminUserControl.validator");
const requirePermission = require("../middleware/requirePermission");
const { PERMISSIONS, ADMIN_ROLES } = require("../config/adminPermissions");

const router = Router();

router.use(authenticate, requireRole(...ADMIN_ROLES));

/** @route GET /api/v1/admin/users */
router.get("/users", adminController.listUsers);

/** @route GET /api/v1/admin/users/:id */
router.get("/users/:id", validate(idParamSchema), adminController.getUser);

/** @route POST /api/v1/admin/users/:id/suspend */
router.post("/users/:id/suspend", requirePermission(PERMISSIONS.MANAGE_USERS), validate(idParamSchema), adminController.suspendUser);

/** @route POST /api/v1/admin/users/:id/activate */
router.post("/users/:id/activate", requirePermission(PERMISSIONS.MANAGE_USERS), validate(idParamSchema), adminController.activateUser);

/** @route GET /api/v1/admin/agents */
router.get("/agents", adminController.listAgents);

/** @route GET /api/v1/admin/agents/:id */
router.get("/agents/:id", validate(idParamSchema), adminController.getAgent);

/** @route POST /api/v1/admin/agents/:id/suspend */
router.post("/agents/:id/suspend", validate(idParamSchema), adminController.suspendAgent);

/** @route POST /api/v1/admin/agents/:id/activate */
router.post("/agents/:id/activate", validate(idParamSchema), adminController.activateAgent);

// --- Categories (Backend Stage 3) ---------------------------------------

router.get("/categories", validate(categoryListQuerySchema), adminCourseController.listCategories);
router.post("/categories", validate(createCategorySchema), adminCourseController.createCategory);
router.patch("/categories/:id", validate(updateCategorySchema), adminCourseController.updateCategory);
router.post("/categories/:id/archive", validate(categoryIdParamSchema), adminCourseController.archiveCategory);
router.post("/categories/:id/activate", validate(categoryIdParamSchema), adminCourseController.activateCategory);

// --- Courses --------------------------------------------------------------

router.get("/courses", validate(courseListQuerySchema), adminCourseController.listCourses);
router.get("/courses/:id", validate(courseIdParamSchema), adminCourseController.getCourse);
router.post("/courses", validate(createCourseSchema), adminCourseController.createCourse);
router.patch("/courses/:id", validate(updateCourseSchema), adminCourseController.updateCourse);
router.post("/courses/:id/publish", validate(courseIdParamSchema), adminCourseController.publishCourse);
router.post("/courses/:id/unpublish", validate(courseIdParamSchema), adminCourseController.unpublishCourse);
router.post("/courses/:id/archive", validate(courseIdParamSchema), adminCourseController.archiveCourse);

// --- Modules ------------------------------------------------------------

router.post("/courses/:courseId/modules", validate(createModuleSchema), adminCourseController.createModule);
router.patch("/modules/:id", validate(updateModuleSchema), adminCourseController.updateModule);
router.delete("/modules/:id", validate(moduleIdParamSchema), adminCourseController.deleteModule);
router.patch("/courses/:courseId/modules/reorder", validate(reorderModulesSchema), adminCourseController.reorderModules);

// --- Lessons ------------------------------------------------------------

router.post("/modules/:moduleId/lessons", validate(createLessonSchema), adminCourseController.createLesson);
router.patch("/lessons/:id", validate(updateLessonSchema), adminCourseController.updateLesson);
router.delete("/lessons/:id", validate(lessonIdParamSchema), adminCourseController.deleteLesson);
router.patch("/modules/:moduleId/lessons/reorder", validate(reorderLessonsSchema), adminCourseController.reorderLessons);

// --- Orders (read-only; no refund/cancellation endpoints exist) --------

router.get("/orders", validate(adminOrderListQuerySchema), adminCourseController.listOrders);
router.get("/orders/:id", validate(orderIdParamSchema), adminCourseController.getOrder);

// --- Review moderation ----------------------------------------------------

router.get("/reviews", adminCourseController.listReviews);
router.post("/reviews/:id/approve", validate(reviewIdParamSchema), adminCourseController.approveReview);
router.post("/reviews/:id/hide", validate(reviewIdParamSchema), adminCourseController.hideReview);
router.delete("/reviews/:id", validate(reviewIdParamSchema), adminCourseController.deleteReview);

// --- Financial engine (Backend Stage 4) -----------------------------------
// Read-only visibility + a controlled, auditable withdrawal pipeline.
// There is deliberately NO endpoint to directly edit a balance — see
// platform rule "Admin Security".

router.get("/withdrawals", validate(adminWithdrawalListQuerySchema), withdrawalController.adminListWithdrawals);
router.get("/withdrawals/:id", validate(withdrawalIdParamSchema), withdrawalController.adminGetWithdrawal);
router.post(
  "/withdrawals/:id/approve",
  requirePermission(PERMISSIONS.MANAGE_WITHDRAWALS),
  validate(withdrawalIdParamSchema),
  withdrawalController.adminApproveWithdrawal
);
router.post(
  "/withdrawals/:id/reject",
  requirePermission(PERMISSIONS.MANAGE_WITHDRAWALS),
  validate(rejectWithdrawalSchema),
  withdrawalController.adminRejectWithdrawal
);
router.post(
  "/withdrawals/:id/complete",
  requirePermission(PERMISSIONS.MANAGE_WITHDRAWALS),
  validate(completeWithdrawalSchema),
  withdrawalController.adminCompleteWithdrawal
);

router.get("/transactions", validate(adminTransactionListQuerySchema), adminFinanceController.adminListTransactions);

router.get(
  "/reports/financial-summary",
  validate(adminReportQuerySchema),
  adminFinanceController.getFinancialSummaryReport
);

router.get("/users/:id/reconciliation", validate(idParamSchema), adminFinanceController.reconcileUserBalances);

// --- Payments (Backend Stage 5) — read-only visibility ---------------------

router.get("/payments", validate(adminPaymentListQuerySchema), paymentController.adminListPayments);
router.get("/payments/:reference", validate(referenceParamSchema), paymentController.adminGetPayment);

// --- Platform settings (business rules) -----------------------------------

/** @route GET /api/v1/admin/settings */
router.get("/settings", requirePermission(PERMISSIONS.MANAGE_SETTINGS), adminController.getSettings);

/** @route PATCH /api/v1/admin/settings */
router.patch("/settings", requirePermission(PERMISSIONS.MANAGE_SETTINGS), validate(updateSettingsSchema), adminController.updateSettings);

// --- Notifications ----------------------------------------------------------

/** @route POST /api/v1/admin/notifications */
router.post("/notifications", requirePermission(PERMISSIONS.SEND_NOTIFICATIONS), validate(sendNotificationSchema), adminController.sendNotification);

// --- User Dashboard Control Center: per-customer actions -------------------

/** @route POST /api/v1/admin/users/:id/courses — grant course access */
router.post("/users/:id/courses", requirePermission(PERMISSIONS.MANAGE_COURSE_ACCESS), validate(courseAccessSchema), adminController.grantCourseAccess);

/** @route DELETE /api/v1/admin/users/:id/courses/:courseId — revoke ONLY admin-granted access */
router.delete("/users/:id/courses/:courseId", requirePermission(PERMISSIONS.MANAGE_COURSE_ACCESS), validate(revokeCourseAccessSchema), adminController.revokeCourseAccess);

/** @route POST /api/v1/admin/users/:id/balance-adjustments */
router.post("/users/:id/balance-adjustments", requirePermission(PERMISSIONS.ADJUST_BALANCE), validate(adjustBalanceSchema), adminController.adjustBalance);

/** @route PATCH /api/v1/admin/users/:id/feature-overrides */
router.patch("/users/:id/feature-overrides", requirePermission(PERMISSIONS.MANAGE_USER_OVERRIDES), validate(userFeatureOverridesSchema), adminController.setUserFeatureOverrides);

/** @route PATCH /api/v1/admin/users/:id/section-overrides — Financial Dashboard Control, Part 4 */
router.patch("/users/:id/section-overrides", requirePermission(PERMISSIONS.MANAGE_USER_OVERRIDES), validate(userSectionOverridesSchema), adminController.setUserSectionOverrides);

/** @route PATCH /api/v1/admin/users/:id/role — assign an admin role (Part 15) */
router.patch("/users/:id/role", requirePermission(PERMISSIONS.MANAGE_ADMIN_ROLES), validate(setAdminRoleSchema), adminController.setUserRole);

module.exports = router;

