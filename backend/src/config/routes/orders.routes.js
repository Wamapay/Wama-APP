"use strict";

/**
 * Order (purchase) routes for the authenticated buyer. Admin order
 * visibility lives under /api/v1/admin/orders (see admin.routes.js).
 */
const { Router } = require("express");
const orderController = require("../controllers/order.controller");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { createOrderSchema, orderIdParamSchema, orderListQuerySchema } = require("../validators/order.validator");

const router = Router();

router.use(authenticate);

/** @route POST /api/v1/orders @desc Create a PENDING order (server-priced) @access Private */
router.post("/", validate(createOrderSchema), orderController.createOrder);

/** @route GET /api/v1/orders @desc Current user's purchase history @access Private */
router.get("/", validate(orderListQuerySchema), orderController.listMyOrders);

/** @route GET /api/v1/orders/:id @desc Current user's own order only @access Private */
router.get("/:id", validate(orderIdParamSchema), orderController.getMyOrder);

module.exports = router;
