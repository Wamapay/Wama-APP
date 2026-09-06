"use strict";

const { Router } = require("express");
const communityChatController = require("../controllers/communityChat.controller");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { chatRateLimiter } = require("../middleware/rateLimiter");
const {
  listMessagesQuerySchema,
  sendMessageSchema,
} = require("../validators/communityChat.validator");

const router = Router();

router.use(authenticate);

/** @route GET /api/v1/community/chat/messages @access Private (any signed-in user) */
router.get("/messages", validate(listMessagesQuerySchema), communityChatController.listMessages);

/** @route POST /api/v1/community/chat/messages @access Private (any signed-in user) */
router.post("/messages", chatRateLimiter, validate(sendMessageSchema), communityChatController.sendMessage);

module.exports = router;
