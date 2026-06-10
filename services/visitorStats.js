const crypto = require("crypto");

const redisSvc = require("./redis");

const ACTIVE_WINDOW_SECONDS = 60;
const DAILY_STATS_TTL_SECONDS = 60 * 60 * 24 * 30;
const ACTIVE_VISITORS_KEY = "stats:active_visitors_zset";
const TOTAL_PAGE_VIEWS_KEY = "stats:total_page_views";
const TOTAL_UNIQUE_VISITORS_KEY = "stats:total_unique_visitors";

const memoryStats = {
  totalPageViews: 0,
  totalVisitors: new Set(),
  dailyPageViews: new Map(),
  dailyVisitors: new Map(),
  activeVisitors: new Map(),
};

function getRedis() {
  if (typeof redisSvc.getRedisClient === "function") {
    return redisSvc.getRedisClient();
  }

  return null;
}

function getRedisStatus() {
  const redis = getRedis();
  if (!redis) return "not_connected";
  return redis.isReady ? "ready" : redis.isOpen ? "connected" : "not_connected";
}

function logVisitorStats(event, extra = {}) {
  console.log(JSON.stringify({
    type: "visitor_stats",
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

function getDailyPageViewsKey(today) {
  return `stats:daily_page_views:${today}`;
}

function getDailyUniqueVisitorsKey(today) {
  return `stats:daily_unique_visitors:${today}`;
}

function getVisitorId(req) {
  if (
    req.body &&
    typeof req.body.visitorId === "string" &&
    req.body.visitorId.length <= 128
  ) {
    return req.body.visitorId;
  }

  const raw = [
    req.ip || req.socket.remoteAddress || "unknown-ip",
    req.headers["user-agent"] || "unknown-agent",
  ].join("|");

  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function markVisitorActive(redis, visitorId, now = Math.floor(Date.now() / 1000)) {
  await redis.zAdd(ACTIVE_VISITORS_KEY, [{ score: now, value: visitorId }]);
  await redis.zRemRangeByScore(ACTIVE_VISITORS_KEY, 0, now - ACTIVE_WINDOW_SECONDS);
  await redis.expire(ACTIVE_VISITORS_KEY, ACTIVE_WINDOW_SECONDS * 2);
  return redis.zCard(ACTIVE_VISITORS_KEY);
}

function pruneMemoryActiveVisitors(now = Math.floor(Date.now() / 1000)) {
  const staleBefore = now - ACTIVE_WINDOW_SECONDS;

  Array.from(memoryStats.activeVisitors.entries()).forEach(([visitorId, lastSeen]) => {
    if (lastSeen < staleBefore) {
      memoryStats.activeVisitors.delete(visitorId);
    }
  });
}

function getMemoryDailyVisitors(today) {
  if (!memoryStats.dailyVisitors.has(today)) {
    memoryStats.dailyVisitors.set(today, new Set());
  }

  return memoryStats.dailyVisitors.get(today);
}

function getMemoryDailyPageViews(today) {
  return memoryStats.dailyPageViews.get(today) || 0;
}

function buildMemoryStatsResponse(today) {
  pruneMemoryActiveVisitors();

  return {
    today,
    timezone: "Asia/Taipei",
    totalPageViews: memoryStats.totalPageViews,
    todayPageViews: getMemoryDailyPageViews(today),
    totalVisitors: memoryStats.totalVisitors.size,
    todayVisitors: getMemoryDailyVisitors(today).size,
    activeVisitors: memoryStats.activeVisitors.size,
    redis: getRedisStatus(),
    storage: "memory",
  };
}

function trackMemoryView(visitorId) {
  const today = getTodayKey();
  const now = Math.floor(Date.now() / 1000);
  const dailyVisitors = getMemoryDailyVisitors(today);

  memoryStats.totalPageViews += 1;
  memoryStats.dailyPageViews.set(today, getMemoryDailyPageViews(today) + 1);
  memoryStats.totalVisitors.add(visitorId);
  dailyVisitors.add(visitorId);
  memoryStats.activeVisitors.set(visitorId, now);

  return buildMemoryStatsResponse(today);
}

function heartbeatMemoryVisitor(visitorId) {
  const now = Math.floor(Date.now() / 1000);
  memoryStats.activeVisitors.set(visitorId, now);
  pruneMemoryActiveVisitors(now);

  return {
    activeVisitors: memoryStats.activeVisitors.size,
    redis: getRedisStatus(),
    storage: "memory",
  };
}

async function trackVisitorView(req) {
  const visitorId = getVisitorId(req);

  try {
    const redis = getRedis();
    if (!redis) {
      const data = trackMemoryView(visitorId);
      logVisitorStats("track_view_memory", data);
      return data;
    }

    const today = getTodayKey();
    const now = Math.floor(Date.now() / 1000);
    const todayPageViewsKey = getDailyPageViewsKey(today);
    const todayUniqueKey = getDailyUniqueVisitorsKey(today);

    const totalPageViews = await redis.incr(TOTAL_PAGE_VIEWS_KEY);
    const todayPageViews = await redis.incr(todayPageViewsKey);

    await redis.pfAdd(TOTAL_UNIQUE_VISITORS_KEY, visitorId);
    await redis.pfAdd(todayUniqueKey, visitorId);
    await redis.expire(todayPageViewsKey, DAILY_STATS_TTL_SECONDS);
    await redis.expire(todayUniqueKey, DAILY_STATS_TTL_SECONDS);

    const activeVisitors = await markVisitorActive(redis, visitorId, now);
    const totalVisitors = await redis.pfCount(TOTAL_UNIQUE_VISITORS_KEY);
    const todayVisitors = await redis.pfCount(todayUniqueKey);

    logVisitorStats("track_view", {
      today,
      totalPageViews,
      todayPageViews,
      totalVisitors,
      todayVisitors,
      activeVisitors,
    });

    return {
      today,
      timezone: "Asia/Taipei",
      totalPageViews,
      todayPageViews,
      totalVisitors,
      todayVisitors,
      activeVisitors,
      redis: getRedisStatus(),
      storage: "redis",
    };
  } catch (err) {
    console.error("[Redis] track view failed:", err.message);
    const data = trackMemoryView(visitorId);
    logVisitorStats("track_view_memory_fallback", {
      error: err.message,
      ...data,
    });
    return data;
  }
}

async function heartbeatVisitor(req) {
  const visitorId = getVisitorId(req);

  try {
    const redis = getRedis();
    if (!redis) {
      return heartbeatMemoryVisitor(visitorId);
    }

    const activeVisitors = await markVisitorActive(redis, visitorId);

    return {
      activeVisitors,
      redis: getRedisStatus(),
      storage: "redis",
    };
  } catch (err) {
    console.error("[Redis] heartbeat failed:", err.message);
    return heartbeatMemoryVisitor(visitorId);
  }
}

async function readVisitorStats() {
  try {
    const redis = getRedis();
    if (!redis) {
      return buildMemoryStatsResponse(getTodayKey());
    }

    const today = getTodayKey();
    const now = Math.floor(Date.now() / 1000);
    const todayPageViewsKey = getDailyPageViewsKey(today);
    const todayUniqueKey = getDailyUniqueVisitorsKey(today);

    await redis.zRemRangeByScore(ACTIVE_VISITORS_KEY, 0, now - ACTIVE_WINDOW_SECONDS);

    const totalPageViews = Number((await redis.get(TOTAL_PAGE_VIEWS_KEY)) || 0);
    const todayPageViews = Number((await redis.get(todayPageViewsKey)) || 0);
    const totalVisitors = await redis.pfCount(TOTAL_UNIQUE_VISITORS_KEY);
    const todayVisitors = await redis.pfCount(todayUniqueKey);
    const activeVisitors = await redis.zCard(ACTIVE_VISITORS_KEY);

    return {
      totalPageViews,
      todayPageViews,
      totalVisitors,
      todayVisitors,
      activeVisitors,
      today,
      timezone: "Asia/Taipei",
      redis: getRedisStatus(),
      storage: "redis",
    };
  } catch (err) {
    console.error("[Redis] get stats failed:", err.message);
    return buildMemoryStatsResponse(getTodayKey());
  }
}

module.exports = {
  heartbeatVisitor,
  readVisitorStats,
  trackVisitorView,
};
