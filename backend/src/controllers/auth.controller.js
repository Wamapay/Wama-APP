"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const authService = require("../services/auth.service");
const { toPublicUser } = require("../models/user.mapper");

const GENERIC_RESET_MESSAGE =
  "If an account with that email exists, password reset instructions have been sent.";
const GENERIC_VERIFICATION_MESSAGE =
  "If an unverified account with that email exists, a verification link has been sent.";

const register = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password, referralCode } = req.body;
  const user = await authService.register({ fullName, email, phone, password, referralCode });
  const { emailSent } = await authService.issueEmailVerificationToken(user);

  return ApiResponse.success(res, {
    statusCode: 201,
    message: emailSent
      ? "Account created successfully. Please check your email to verify your account before logging in."
      : "Account created successfully, but we couldn't send the verification email right now. Use \"Resend verification email\" to try again.",
    data: { user: toPublicUser(user), emailSent },
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, tokens } = await authService.login({ email, password });

  return ApiResponse.success(res, {
    message: "Login successful",
    data: { user: toPublicUser(user), tokens },
  });
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const { tokens } = await authService.refresh(refreshToken);

  return ApiResponse.success(res, {
    message: "Token refreshed",
    data: { tokens },
  });
});

const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  await authService.revokeRefreshToken(refreshToken);

  return ApiResponse.success(res, {
    message: "Logged out successfully",
    data: {},
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, currentPassword, newPassword);

  return ApiResponse.success(res, {
    message: "Password changed successfully. Please log in again.",
    data: {},
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  return ApiResponse.success(res, { message: GENERIC_RESET_MESSAGE, data: {} });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  await authService.resetPassword(token, newPassword);
  return ApiResponse.success(res, { message: "Password has been reset successfully.", data: {} });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  await authService.verifyEmail(token);
  return ApiResponse.success(res, { message: "Email verified successfully.", data: {} });
});

const resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerification(req.body.email);
  return ApiResponse.success(res, { message: GENERIC_VERIFICATION_MESSAGE, data: {} });
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
};
