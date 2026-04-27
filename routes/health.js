const express = require("express");
const {
  redis,
  getRedisStatus,
  getRedisEndpoint,
} = require("../services/redis");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    app: "running",
    version: process.env.APP_VERSION || "v6",
  });
});

router.get("/ready", async (req, res) => {
  try {
    await redis.ping();

    res.status(200).json({
      status: "ready",
      app: "running",
      redis: getRedisStatus(),
      endpoint: getRedisEndpoint(),
      version: process.env.APP_VERSION || "v6",
    });
  } catch (err) {
    res.status(500).json({
      status: "not_ready",
      app: "running",
      redis: getRedisStatus(),
      endpoint: getRedisEndpoint(),
      version: process.env.APP_VERSION || "v6",
      error: err.message,
    });
  }
});

module.exports = router;