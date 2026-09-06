"use strict";

const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");
const communityChatService = require("../services/communityChat.service");

function toPublicMessage(m) {
  return {
    id: m.id,
    message: m.message,
    createdAt: m.createdAt,
    author: {
      id: m.user.id,
      fullName: m.user.fullName,
      profileImage: m.user.profileImage,
    },
  };
}

const listMessages = asyncHandler(async (req, res) => {
  const messages = await communityChatService.listMessages({ after: req.query.after, limit: req.query.limit });
  return ApiResponse.success(res, {
    message: "Messages retrieved",
    data: { messages: messages.map(toPublicMessage) },
  });
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await communityChatService.sendMessage(req.user.id, req.body.message);
  return ApiResponse.success(res, {
    statusCode: 201,
    message: "Message sent",
    data: { message: toPublicMessage(message) },
  });
});

const deleteMessage = asyncHandler(async (req, res) => {
  await communityChatService.deleteMessage(req.params.id);
  return ApiResponse.success(res, { message: "Message deleted" });
});

module.exports = { listMessages, sendMessage, deleteMessage };
