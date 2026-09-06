/**
 * Builds a small placeholder router for modules whose real routes/logic
 * will be implemented in a later backend stage. Keeps Stage 1 honest:
 * the endpoint exists and responds cleanly, but clearly states it is
 * not yet implemented instead of pretending to work.
 */
"use strict";

const { Router } = require("express");

function buildPlaceholderRouter(moduleName, stageLabel = "a future backend stage") {
  const router = Router();

  router.all("*", (req, res) => {
    res.status(501).json({
      success: false,
      message: `The "${moduleName}" module is not implemented yet. It will be built in ${stageLabel}.`,
      data: null,
    });
  });

  return router;
}

module.exports = buildPlaceholderRouter;
