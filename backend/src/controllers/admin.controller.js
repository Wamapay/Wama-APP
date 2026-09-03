"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const adminService = require("../services/admin.service");
const agentService = require("../services/agent.service");
const platformSettings = require("../services/platformSettings.service");
const notificationService = require("../services/notification.service");
const userControlService = require("../services/adminUserControl.service");
const { toPublicUser, toPublicAgent } = require("../models/user.mapper");

const listUsers = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await adminService.listUsers(req.query);
  return ApiResponse.success(res, {
    message: "Users retrieved",
    data: { users: items.map(toPublicUser), total, page, pageSize },
  });
});

const getUser = asyncHandler(async (req, res) => {
  const user = await adminService.getUserById(req.params.id);
  return ApiResponse.success(res, { message: "User retrieved", data: { user: toPublicUser(user) } });
});

const suspendUser = asyncHandler(async (req, res) => {
  const user = await adminService.setUserStatus({
    adminId: req.user.id,
    userId: req.params.id,
    status: "SUSPENDED",
  });
  return ApiResponse.success(res, { message: "User suspended", data: { user: toPublicUser(user) } });
});

const activateUser = asyncHandler(async (req, res) => {
  const user = await adminService.setUserStatus({
    adminId: req.user.id,
    userId: req.params.id,
    status: "ACTIVE",
  });
  return ApiResponse.success(res, { message: "User activated", data: { user: toPublicUser(user) } });
});

const listAgents = asyncHandler(async (req, res) => {
  const { items, total, page, pageSize } = await adminService.listAgents(req.query);
  return ApiResponse.success(res, {
    message: "Agents retrieved",
    data: {
      agents: items.map((agent) => ({ ...toPublicAgent(agent), user: toPublicUser(agent.user) })),
      total,
      page,
      pageSize,
    },
  });
});

const getAgent = asyncHandler(async (req, res) => {
  const agent = await adminService.getAgentById(req.params.id);
  return ApiResponse.success(res, {
    message: "Agent retrieved",
    data: { agent: { ...toPublicAgent(agent), user: toPublicUser(agent.user) } },
  });
});

const suspendAgent = asyncHandler(async (req, res) => {
  const agent = await adminService.setAgentStatus({
    adminId: req.user.id,
    agentId: req.params.id,
    status: "SUSPENDED",
  });
  return ApiResponse.success(res, { message: "Agent suspended", data: { agent: toPublicAgent(agent) } });
});

const activateAgent = asyncHandler(async (req, res) => {
  const agent = await adminService.setAgentStatus({
    adminId: req.user.id,
    agentId: req.params.id,
    status: "ACTIVE",
  });
  return ApiResponse.success(res, { message: "Agent activated", data: { agent: toPublicAgent(agent) } });
});

// --- Platform settings (business rules: rates, thresholds, tiers) -------

const getSettings = asyncHandler(async (req, res) => {
  const settings = await platformSettings.getSettings();
  return ApiResponse.success(res, { message: "Settings retrieved", data: { settings } });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await platformSettings.updateSettings(req.body, req.user.id);
  await adminService.logAdminActivity({
    adminId: req.user.id,
    action: "UPDATE_PLATFORM_SETTINGS",
    targetType: "PlatformSettings",
    targetId: settings.id,
  });
  return ApiResponse.success(res, { message: "Settings updated", data: { settings } });
});

// --- Notifications (admin -> user/agent, or broadcast) -------------------

const sendNotification = asyncHandler(async (req, res) => {
  const { title, message, audience, userId } = req.body;
  const result = await notificationService.sendFromAdmin({
    adminId: req.user.id,
    title,
    message,
    audience,
    userId,
  });
  await adminService.logAdminActivity({
    adminId: req.user.id,
    action: "SEND_NOTIFICATION",
    targetType: "Notification",
    targetId: audience === "USER" ? userId : audience,
  });
  return ApiResponse.success(res, {
    statusCode: 201,
    message: `Notification sent to ${result.count} recipient(s)`,
    data: { count: result.count },
  });
});

// --- User Dashboard Control Center: per-customer actions ------------------

const grantCourseAccess = asyncHandler(async (req, res) => {
  const enrollment = await userControlService.grantCourseAccess({
    adminId: req.user.id,
    userId: req.params.id,
    courseId: req.body.courseId,
  });
  return ApiResponse.success(res, { statusCode: 201, message: "Course access granted", data: { enrollment } });
});

const revokeCourseAccess = asyncHandler(async (req, res) => {
  const enrollment = await userControlService.revokeCourseAccess({
    adminId: req.user.id,
    userId: req.params.id,
    courseId: req.params.courseId,
  });
  return ApiResponse.success(res, { message: "Course access revoked", data: { enrollment } });
});

const adjustBalance = asyncHandler(async (req, res) => {
  const { balanceType, amount, reason } = req.body;
  const transaction = await userControlService.adjustBalance({
    adminId: req.user.id,
    userId: req.params.id,
    balanceType,
    amount,
    reason,
  });
  return ApiResponse.success(res, { statusCode: 201, message: "Balance adjusted", data: { transaction } });
});

const setUserFeatureOverrides = asyncHandler(async (req, res) => {
  const user = await userControlService.setUserFeatureOverrides({
    adminId: req.user.id,
    userId: req.params.id,
    overrides: req.body.overrides,
  });
  return ApiResponse.success(res, { message: "Feature overrides updated", data: { user } });
});

const setUserSectionOverrides = asyncHandler(async (req, res) => {
  const user = await userControlService.setUserSectionOverrides({
    adminId: req.user.id,
    userId: req.params.id,
    overrides: req.body.overrides,
  });
  return ApiResponse.success(res, { message: "Section overrides updated", data: { user } });
});

const setUserRole = asyncHandler(async (req, res) => {
  const user = await userControlService.setUserRole({
    actingAdminId: req.user.id,
    actingAdminRole: req.user.role,
    userId: req.params.id,
    role: req.body.role,
  });
  return ApiResponse.success(res, { message: "Role updated", data: { user } });
});

module.exports = {
  listUsers,
  getUser,
  suspendUser,
  activateUser,
  listAgents,
  getAgent,
  suspendAgent,
  activateAgent,
  getSettings,
  updateSettings,
  sendNotification,
  grantCourseAccess,
  revokeCourseAccess,
  adjustBalance,
  setUserFeatureOverrides,
  setUserSectionOverrides,
  setUserRole,
};
