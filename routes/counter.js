const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { redis, getRedisStatus } = require("../services/redis");

const router = express.Router();

const ACTIVE_WINDOW_SECONDS = 30;
const DAILY_STATS_TTL_SECONDS = 60 * 60 * 24 * 30;

function logCounter(event, extra = {}) {
  console.log(JSON.stringify({
    type: "counter",
    event,
    timestamp: new Date().toISOString(),
    ...extra,
  }));
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.post("/track-view", async (req, res) => {
  try {
    const today = getTodayKey();
    const visitorId = getVisitorId(req);
    const now = Math.floor(Date.now() / 1000);

    const totalPageViewsKey = "stats:total_page_views";
    const todayPageViewsKey = `stats:daily_page_views:${today}`;
    const totalUniqueKey = "stats:total_unique_visitors";
    const todayUniqueKey = `stats:daily_unique_visitors:${today}`;
    const activeKey = "stats:active_visitors_zset";

    const totalPageViews = await redis.incr(totalPageViewsKey);
    const todayPageViews = await redis.incr(todayPageViewsKey);

    await redis.pfAdd(totalUniqueKey, visitorId);
    await redis.pfAdd(todayUniqueKey, visitorId);

    await redis.expire(todayPageViewsKey, DAILY_STATS_TTL_SECONDS);
    await redis.expire(todayUniqueKey, DAILY_STATS_TTL_SECONDS);

    await redis.zAdd(activeKey, [{ score: now, value: visitorId }]);
    await redis.zRemRangeByScore(activeKey, 0, now - ACTIVE_WINDOW_SECONDS);
    await redis.expire(activeKey, ACTIVE_WINDOW_SECONDS * 2);

    const totalVisitors = await redis.pfCount(totalUniqueKey);
    const todayVisitors = await redis.pfCount(todayUniqueKey);
    const activeVisitors = await redis.zCard(activeKey);

    logCounter("track_view", {
      today,
      totalPageViews,
      todayPageViews,
      totalVisitors,
      todayVisitors,
      activeVisitors,
    });

    res.json({
      today,
      timezone: "Asia/Taipei",
      totalPageViews,
      todayPageViews,
      totalVisitors,
      todayVisitors,
      activeVisitors,
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[Redis] track view failed:", err.message);
    res.status(500).json({
      error: err.message,
      redis: getRedisStatus(),
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const today = getTodayKey();
    const now = Math.floor(Date.now() / 1000);

    const todayPageViewsKey = `stats:daily_page_views:${today}`;
    const todayUniqueKey = `stats:daily_unique_visitors:${today}`;
    const activeKey = "stats:active_visitors_zset";

    await redis.zRemRangeByScore(activeKey, 0, now - ACTIVE_WINDOW_SECONDS);

    const totalPageViews = Number((await redis.get("stats:total_page_views")) || 0);
    const todayPageViews = Number((await redis.get(todayPageViewsKey)) || 0);
    const totalVisitors = await redis.pfCount("stats:total_unique_visitors");
    const todayVisitors = await redis.pfCount(todayUniqueKey);
    const activeVisitors = await redis.zCard(activeKey);
    const count = Number((await redis.get("counter")) || 0);

    res.json({
      totalPageViews,
      todayPageViews,
      totalVisitors,
      todayVisitors,
      activeVisitors,
      today,
      timezone: "Asia/Taipei",
      count,
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[Redis] get stats failed:", err.message);
    res.status(500).json({
      error: err.message,
      redis: getRedisStatus(),
    });
  }
});

router.get("/count", async (req, res) => {
  try {
    const count = Number((await redis.get("counter")) || 0);
    res.json({ count, redis: getRedisStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message, redis: getRedisStatus() });
  }
});

router.post("/increment", async (req, res) => {
  try {
    const count = await redis.incr("counter");
    logCounter("increment", { count });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/reset", async (req, res) => {
  try {
    await redis.set("counter", 0);
    logCounter("reset", { count: 0 });
    res.json({ count: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;