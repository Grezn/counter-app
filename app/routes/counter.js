const express = require("express");
const path = require("path");
const crypto = require("crypto");

const redisSvc = require("../services/redis");

// router 是 Express 的小型路由器。
// 你可以把這個檔案想成「計數器和統計 API 的清單」。
const router = express.Router();

// 最近 30 秒內有出現過的訪客，會被算成 Active Now。
const ACTIVE_WINDOW_SECONDS = 30;
const DAILY_STATS_TTL_SECONDS = 60 * 60 * 24 * 30;

function getRedis() {
  // 透過 services/redis.js 拿到共用 Redis client。
  // 多包一層 function 是為了避免 redisSvc 沒有正常 export 時直接爆掉。
  if (typeof redisSvc.getRedisClient === "function") {
    return redisSvc.getRedisClient();
  }
  return null;
}

function getRedisStatus() {
  // 給前端顯示 Redis 狀態用。
  // ready 表示 Redis 可以正常收命令；connected 只表示 socket 開著。
  const r = getRedis();
  if (!r) return "not_connected";
  return r.isReady ? "ready" : r.isOpen ? "connected" : "not_connected";
}

function isResetAuthorized(req) {
  // RESET_TOKEN 只放在 server/EC2 環境變數，不放在前端。
  // 使用者按 Reset 時，前端會把 token 放在 x-reset-token header。
  const expected = process.env.RESET_TOKEN;
  if (!expected) return false;

  const provided = req.headers["x-reset-token"];
  return typeof provided === "string" && provided === expected;
}

function logCounter(event, extra = {}) {
  // 計數器相關事件另外寫一筆 JSON log，方便 docker logs / CloudWatch 搜尋。
  console.log(
    JSON.stringify({
      type: "counter",
      event,
      timestamp: new Date().toISOString(),
      ...extra,
    })
  );
}

function getTodayKey() {
  // 統計「今天」時要固定使用台北時區。
  // en-CA 會輸出 YYYY-MM-DD，適合拿來當 Redis key 的一部分。
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getVisitorId(req) {
  // 瀏覽器會把 visitorId 存在 localStorage。
  // 後端還是要檢查長度，避免奇怪的請求塞很大的資料進 Redis。
  if (
    req.body &&
    typeof req.body.visitorId === "string" &&
    req.body.visitorId.length <= 128
  ) {
    return req.body.visitorId;
  }

  const raw = [
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-ip",
    req.headers["user-agent"] || "unknown-agent",
  ].join("|");

  // 如果瀏覽器沒有傳 visitorId，就用 IP + User-Agent 做 hash。
  // hash 後不會直接把原始 IP 存進 Redis。
  return crypto.createHash("sha256").update(raw).digest("hex");
}

router.get("/", (req, res) => {
  // 使用者打開首頁時，回傳 public/index.html。
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.post("/track-view", async (req, res) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({
        error: "redis client not available",
        redis: getRedisStatus(),
      });
    }

    const today = getTodayKey();
    const visitorId = getVisitorId(req);
    const now = Math.floor(Date.now() / 1000);

    // Redis key 命名：
    // - total_* 是永久累積
    // - daily_* 是每天一組 key
    // - active_visitors_zset 用 sorted set 記錄最近活躍時間
    const totalPageViewsKey = "stats:total_page_views";
    const todayPageViewsKey = `stats:daily_page_views:${today}`;
    const totalUniqueKey = "stats:total_unique_visitors";
    const todayUniqueKey = `stats:daily_unique_visitors:${today}`;
    const activeKey = "stats:active_visitors_zset";

    // incr 是 Redis 的原子遞增。多人同時打開網頁也不會互相蓋掉。
    const totalPageViews = await redis.incr(totalPageViewsKey);
    const todayPageViews = await redis.incr(todayPageViewsKey);

    // HyperLogLog 用來估算不重複訪客數，比直接存 set 更省記憶體。
    await redis.pfAdd(totalUniqueKey, visitorId);
    await redis.pfAdd(todayUniqueKey, visitorId);

    // 每日統計只保留 30 天，避免 Redis key 永遠增加。
    await redis.expire(todayPageViewsKey, DAILY_STATS_TTL_SECONDS);
    await redis.expire(todayUniqueKey, DAILY_STATS_TTL_SECONDS);

    // sorted set 的 score 放 timestamp。
    // 每次 track view 都更新 visitorId 的最後活躍時間，再刪掉超過 30 秒的人。
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
      // 回給前端的資料。public/index.html 會用這些值更新畫面。
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
    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({
        error: "redis client not available",
        redis: getRedisStatus(),
      });
    }

    const today = getTodayKey();
    const now = Math.floor(Date.now() / 1000);

    const todayPageViewsKey = `stats:daily_page_views:${today}`;
    const todayUniqueKey = `stats:daily_unique_visitors:${today}`;
    const activeKey = "stats:active_visitors_zset";

    // 每次讀統計時順便清掉超過 active window 的舊資料。
    await redis.zRemRangeByScore(activeKey, 0, now - ACTIVE_WINDOW_SECONDS);

    // Redis get 回來是字串，所以用 Number() 轉成數字。
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
    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({
        error: "redis client not available",
        redis: getRedisStatus(),
      });
    }

    // counter 是目前畫面上的 Current Count。
    const count = Number((await redis.get("counter")) || 0);
    res.json({ count, redis: getRedisStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message, redis: getRedisStatus() });
  }
});

router.post("/increment", async (req, res) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({
        error: "redis client not available",
        redis: getRedisStatus(),
      });
    }

    // incr 會把 counter +1，並回傳加完後的新數字。
    const count = await redis.incr("counter");
    logCounter("increment", { count });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message, redis: getRedisStatus() });
  }
});

router.post("/reset", async (req, res) => {
  try {
    // 沒有設定 RESET_TOKEN 就不允許 reset。
    // 這比「沒設定就放行」安全很多。
    if (!process.env.RESET_TOKEN) {
      return res.status(503).json({
        error: "reset token is not configured",
      });
    }

    // token 不對就回 403 forbidden。
    if (!isResetAuthorized(req)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({
        error: "redis client not available",
        redis: getRedisStatus(),
      });
    }

    // reset 只重置 Current Count，不會清掉訪客統計。
    await redis.set("counter", 0);
    logCounter("reset", { count: 0 });
    res.json({ count: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message, redis: getRedisStatus() });
  }
});

module.exports = router;
