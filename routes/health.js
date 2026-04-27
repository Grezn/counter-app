const express = require("express");
const {
  redis,
  getRedisStatus,
  getRedisEndpoint,
} = require("../services/redis");

const router = express.Router();

// Liveness：只確認 App 本身還活著
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    app: "running",
    version: "v4",
  });
});

// Readiness：確認 App 的依賴服務 Redis 是否可用
router.get("/ready", async (req, res) => {
  try {
    await redis.ping();

    res.status(200).json({
      status: "ready",
      app: "running",
      redis: getRedisStatus(),
      endpoint: getRedisEndpoint(),
      version: "v4",
    });
  } catch (err) {
    res.status(500).json({
      status: "not_ready",
      app: "running",
      redis: getRedisStatus(),
      endpoint: getRedisEndpoint(),
      version: "v4",
      error: err.message,
    });
  }
});

module.exports = router;