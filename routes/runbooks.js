const express = require("express");

const { listRunbooks } = require("../services/runbooks");

const router = express.Router();

router.get("/api/runbooks", async (req, res) => {
  try {
    res.json(await listRunbooks(req.query));
  } catch (err) {
    console.error("[Runbooks] load failed:", err.message);
    res.status(500).json({
      error: "runbooks unavailable",
    });
  }
});

module.exports = router;
