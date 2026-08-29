/**
 * Central route mount point. Every module gets its own prefixed router;
 * modules not yet implemented in the current backend stage use the
 * placeholder router so the endpoint still exists and responds cleanly.
 */
"use strict";

const { Router } = require("express");
const { config } = require("../config/env");

const router = Router();

router.use("/health", require("./health.routes"));
router.use("/auth", require("./auth.routes"));
router.use("/users", require("./users.routes"));
router.use("/agents", require("./agents.routes"));
router.use("/admin", require("./admin.routes"));

// Backend Stage 3 — courses, content, purchases & course access.
router.use("/courses", require("./courses.routes"));
router.use("/categories", require("./categories.routes"));
router.use("/orders", require("./orders.routes"));

// Backend Stage 4 — financial engine. Withdrawals get a real router;
// commissions/transactions/reports stay placeholders below because their
// actual read APIs live under /users/me/* and /admin/* instead (see
// users.routes.js, agents.routes.js, admin.routes.js).
router.use("/withdrawals", require("./withdrawals.routes"));

// Backend Stage 5 — Paystack payment integration.
router.use("/payments", require("./payments.routes"));

// Not yet implemented — architecture placeholders (see each file's header
// comment for which backend stage will build them out).
router.use("/transactions", require("./transactions.routes"));
router.use("/commissions", require("./commissions.routes"));
router.use("/notifications", require("./notifications.routes"));
router.use("/reports", require("./reports.routes"));

if (config.enableDevRoutes) {
  router.use("/dev", require("./dev.routes"));
}

module.exports = router;
