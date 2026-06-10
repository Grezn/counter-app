const express = require("express");
const router = express.Router();
const { getRedisClient } = require("../services/redis");

// /health 是最簡單的健康檢查。
// 只要 Node.js process 還能回應，就回 200。
// 它不檢查 Redis，所以比較適合用來確認 app 本身有沒有活著。
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// /ready 給 ALB / Docker healthcheck 使用。
// Redis 目前只影響統計與後端事件紀錄；不可用時前端仍可用本機暫存繼續值班。
router.get("/ready", async (req, res) => {
  const client = getRedisClient();

  if (!client || !client.isReady) {
    return res.status(200).json({
      status: "ready",
      redis: "degraded",
    });
  }

  try {
    // ping Redis，確認不是只有 client 物件存在，而是真的能和 Redis 互通。
    await client.ping();

    res.status(200).json({
      status: "ready",
      redis: "ready",
    });
  } catch (err) {
    res.status(200).json({
      status: "ready",
      redis: "degraded",
    });
  }
});

module.exports = router;
