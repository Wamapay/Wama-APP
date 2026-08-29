"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const adminService = require("../services/admin.service");
const agentService = require("../services/agent.service");
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

module.exports = {
  listUsers,
  getUser,
  suspendUser,
  activateUser,
  listAgents,
  getAgent,
  suspendAgent,
  activateAgent,
};
