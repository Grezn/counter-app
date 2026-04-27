const express = require("express");
const router = express.Router();
const { getRedisClient } = require("../services/redis");

// 只檢查 app 活著
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// 檢查 Redis（是否 ready）
router.get("/ready", async (req, res) => {
  try {
    const client = getRedisClient();

    if (!client || !client.isOpen) {
      throw new Error("Redis not connected");
    }

    await client.ping();

    res.status(200).json({ status: "ready" });
  } catch (err) {
    res.status(500).json({
      status: "not ready",
      error: err.message,
    });
  }
});

module.exports = router;