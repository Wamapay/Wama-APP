/**
 * Public shop API — mounted at /api/v1/shop. No authentication: visitors
 * can browse and place orders without an account. Order placement and
 * tracking are rate limited; all prices are computed server-side.
 */
"use strict";

const { Router } = require("express");
const controller = require("../controllers/shop.controller");
const validate = require("../middleware/validate");
const { shopOrderRateLimiter, shopTrackRateLimiter } = require("../middleware/rateLimiter");
const { productListQuerySchema, slugParamSchema, createOrderSchema, trackOrderSchema } = require("../validators/shop.validator");

const router = Router();

router.get("/config", controller.config);
router.get("/categories", controller.categories);
router.get("/products", validate(productListQuerySchema), controller.products);
router.get("/products/:slug", validate(slugParamSchema), controller.product);
// Shareable link with a rich preview (WhatsApp/Facebook/etc. don't run the
// SPA, and the site's #/ routes never reach a server) — people then land on
// the real product page.
router.get("/share", controller.shareProduct); // the shop front
router.get("/share/:slug", validate(slugParamSchema), controller.shareProduct);
router.post("/orders", shopOrderRateLimiter, validate(createOrderSchema), controller.createOrder);
router.get("/orders/track", shopTrackRateLimiter, validate(trackOrderSchema), controller.trackOrder);

module.exports = router;
