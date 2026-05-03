const express = require("express");
const router = express.Router();
const { getRedisClient } = require("../services/redis");

// /health 是最簡單的健康檢查。
// 只要 Node.js process 還能回應，就回 200。
// 它不檢查 Redis，所以比較適合用來確認 app 本身有沒有活著。
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// /ready 是比較嚴格的健康檢查。
// ALB / Docker healthcheck 用這個比較好，因為你的 app 主要功能依賴 Redis。
router.get("/ready", async (req, res) => {
  try {
    const client = getRedisClient();

    // isOpen 代表 socket 已經開啟；如果沒有 Redis 連線，就不能算 ready。
    if (!client || !client.isOpen) {
      throw new Error("Redis not connected");
    }

    // ping Redis，確認不是只有 client 物件存在，而是真的能和 Redis 互通。
    await client.ping();

    res.status(200).json({ status: "ready" });
  } catch (err) {
    res.status(500).json({
      status: "not ready",
      error: "dependency not ready",
    });
  }
});

module.exports = router;
