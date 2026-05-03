const { createClient } = require("redis");

let client;

function getRedisUrl() {
  // 正式環境可以直接設定 REDIS_URL。
  // 如果 EC2 user data 只提供 REDIS_HOST/REDIS_PORT，這裡會組成 Redis URL。
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = process.env.REDIS_PORT || "6379";
  return `redis://${host}:${port}`;
}

function getRedisLogLabel(redisUrl) {
  // Log 要能幫助除錯，但不能把密碼印出來。
  // 以後如果 REDIS_URL 裡有帳密，也只會顯示主機和 port。
  try {
    const parsed = new URL(redisUrl);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "6379"}`;
  } catch {
    return "configured redis url";
  }
}

async function connectRedis() {
  try {
    const redisUrl = getRedisUrl();

    client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
    });

    client.on("error", (err) => {
      console.error("Redis error:", err.message);
    });

    await client.connect();

    console.log("Redis connected:", getRedisLogLabel(redisUrl));
  } catch (err) {
    client = null;
    console.error("Redis connect failed:", err.message);
  }
}

function getRedisClient() {
  return client;
}

module.exports = {
  connectRedis,
  getRedisClient,
};
