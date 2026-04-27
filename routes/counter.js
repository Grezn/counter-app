const express = require("express");
const path = require("path");
const crypto = require("crypto");
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
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function getVisitorId(req) {
  if (req.body && req.body.visitorId) {
    return req.body.visitorId;
  }

  const raw = [
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip",
    req.headers["user-agent"] || "unknown-agent",
  ].join("|");

  return crypto.createHash("sha256").update(raw).digest("hex");
}

router.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.post("/track-view", async (req, res) => {
  try {
    const today = getTodayKey();
    const visitorId = getVisitorId(req);

    // 每次頁面載入都會增加：原始瀏覽量
    const totalPageViews = await redis.incr("stats:total_page_views");
    const todayPageViews = await redis.incr(`stats:daily_page_views:${today}`);

    // HyperLogLog：同一個 visitorId 只算一次，用來估算 unique visitors
    await redis.pFAdd("stats:total_unique_visitors", visitorId);
    await redis.pFAdd(`stats:daily_unique_visitors:${today}`, visitorId);

    const totalVisitors = await redis.pFCount("stats:total_unique_visitors");
    const todayVisitors = await redis.pFCount(`stats:daily_unique_visitors:${today}`);

    logCounter("track_view", {
      today,
      totalPageViews,
      todayPageViews,
      totalVisitors,
      todayVisitors,
    });

    res.json({
      today,
      timezone: "Asia/Taipei",
      totalPageViews,
      todayPageViews,
      totalVisitors,
      todayVisitors,
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

    const totalPageViews = Number((await redis.get("stats:total_page_views")) || 0);
    const todayPageViews = Number((await redis.get(`stats:daily_page_views:${today}`)) || 0);
    const totalVisitors = await redis.pFCount("stats:total_unique_visitors");
    const todayVisitors = await redis.pFCount(`stats:daily_unique_visitors:${today}`);
    const count = Number((await redis.get("counter")) || 0);

    res.json({
      totalPageViews,
      todayPageViews,
      totalVisitors,
      todayVisitors,
      today,
      timezone: "Asia/Taipei",
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