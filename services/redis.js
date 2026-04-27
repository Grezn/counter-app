const { createClient } = require("redis");

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = process.env.REDIS_PORT || "6379";
const REDIS_URL = process.env.REDIS_URL || `redis://${REDIS_HOST}:${REDIS_PORT}`;

let redisStatus = "connecting";

const redis = createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy(retries) {
      return Math.min(retries * 200, 2000);
    },
  },
});

function logRedis(event, extra = {}) {
  console.log(JSON.stringify({
    type: "redis",
    event,
    timestamp: new Date().toISOString(),
    ...extra
  }));
}

redis.on("connect", () => {
  redisStatus = "connected";
  console.log("[Redis] connected");
});

redis.on("ready", () => {
  redisStatus = "ready";
  console.log("[Redis] ready");
});

redis.on("reconnecting", () => {
  redisStatus = "reconnecting";
  console.log("[Redis] reconnecting");
});

redis.on("end", () => {
  redisStatus = "closed";
  console.log("[Redis] closed");
});

redis.on("error", (err) => {
  redisStatus = "error";
  console.error("[Redis] error:", err.message);
});
async function connectRedis() {
  try {
    await redis.connect();
  } catch (err) {
    console.error("[Redis] initial connect failed:", err.message);
  }
}

function getRedisStatus() {
  return redisStatus;
}

function getRedisEndpoint() {
  return `${REDIS_HOST}:${REDIS_PORT}`;
}

module.exports = {
  redis,
  connectRedis,
  getRedisStatus,
  getRedisEndpoint,
};