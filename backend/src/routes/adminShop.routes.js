/**
 * Admin shop management — mounted at /api/v1/admin/shop, inside the admin
 * router, so every route already requires a logged-in admin-tier account.
 */
"use strict";

const { Router } = require("express");
const controller = require("../controllers/shop.controller");
const validate = require("../middleware/validate");
const requirePermission = require("../middleware/requirePermission");
const { PERMISSIONS } = require("../config/adminPermissions");
const s = require("../validators/shop.validator");

const router = Router();

router.get("/settings", controller.adminSettings);
router.patch("/settings", requirePermission(PERMISSIONS.MANAGE_SETTINGS), validate(s.updateSettingsSchema), controller.adminUpdateSettings);

router.get("/categories", controller.adminCategories);
router.post("/categories/defaults", controller.adminAddDefaultCategories);
router.post("/categories", validate(s.createCategorySchema), controller.adminCreateCategory);
router.patch("/categories/:id", validate(s.updateCategorySchema), controller.adminUpdateCategory);
router.delete("/categories/:id", validate(s.idParamSchema), controller.adminDeleteCategory);

router.get("/products", validate(s.adminProductListQuerySchema), controller.adminProducts);
router.post("/products", validate(s.createProductSchema), controller.adminCreateProduct);
router.patch("/products/:id", validate(s.updateProductSchema), controller.adminUpdateProduct);
router.delete("/products/:id", validate(s.idParamSchema), controller.adminDeleteProduct);

router.get("/orders", validate(s.adminOrderListQuerySchema), controller.adminOrders);
router.get("/orders/:id", validate(s.idParamSchema), controller.adminOrder);
router.patch("/orders/:id/status", validate(s.updateOrderStatusSchema), controller.adminUpdateOrderStatus);

module.exports = router;
