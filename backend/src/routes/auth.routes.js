"use strict";

const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { authRateLimiter } = require("../middleware/rateLimiter");
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} = require("../validators/auth.validator");

const router = Router();

/** @route POST /api/v1/auth/register @access Public */
router.post("/register", authRateLimiter, validate(registerSchema), authController.register);

/** @route POST /api/v1/auth/login @access Public */
router.post("/login", authRateLimiter, validate(loginSchema), authController.login);

/** @route POST /api/v1/auth/refresh @access Public (requires valid refresh token) */
router.post("/refresh", validate(refreshSchema), authController.refresh);

/** @route POST /api/v1/auth/logout @access Public (requires valid refresh token) */
router.post("/logout", validate(logoutSchema), authController.logout);

/** @route POST /api/v1/auth/change-password @access Private */
router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);

/** @route POST /api/v1/auth/forgot-password @access Public */
router.post(
  "/forgot-password",
  authRateLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

/** @route POST /api/v1/auth/reset-password @access Public */
router.post(
  "/reset-password",
  authRateLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);

/** @route POST /api/v1/auth/verify-email @access Public */
router.post("/verify-email", validate(verifyEmailSchema), authController.verifyEmail);

/** @route POST /api/v1/auth/resend-verification @access Public */
router.post(
  "/resend-verification",
  authRateLimiter,
  validate(resendVerificationSchema),
  authController.resendVerification
);

module.exports = router;
