const express = require("express");
const path = require("path");
const { redis, getRedisStatus } = require("../services/redis");

const router = express.Router();

function logCounter(event, extra = {}) {
  console.log(JSON.stringify({
    type: "counter",
    event,
    timestamp: new Date().toISOString(),
    ...extra
  }));
}

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

router.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.post("/track-view", async (req, res) => {
  try {
    const today = getTodayKey();

    const totalViews = await redis.incr("stats:total_views");
    const todayViews = await redis.incr(`stats:daily_views:${today}`);

    logCounter("page_view", {
      today,
      totalViews,
      todayViews,
    });

    res.json({
      totalViews,
      todayViews,
      today,
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[Redis] track view failed:", err.message);
    res.status(500).json({
      error: err.message,
    });
  }
});

router.get("/count", async (req, res) => {
  try {
    const value = await redis.get("counter");
    const count = Number(value || 0);

    res.json({
      count,
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[Redis] get count failed:", err.message);
    res.status(500).json({
      error: err.message,
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const today = getTodayKey();

    const totalViews = Number((await redis.get("stats:total_views")) || 0);
    const todayViews = Number((await redis.get(`stats:daily_views:${today}`)) || 0);
    const count = Number((await redis.get("counter")) || 0);

    res.json({
      totalViews,
      todayViews,
      today,
      count,
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[Redis] get stats failed:", err.message);
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/increment", async (req, res) => {
  try {
    const count = await redis.incr("counter");
    logCounter("increment", { count });
    res.json({ count });
  } catch (err) {
    console.error("[Redis] increment failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/reset", async (req, res) => {
  try {
    await redis.set("counter", 0);
    logCounter("reset", { count: 0 });
    res.json({ count: 0 });
  } catch (err) {
    console.error("[Redis] reset failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;