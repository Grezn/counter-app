const { createClient } = require("redis");

// client 是整個 app 共用的 Redis 連線。
// 先在 connectRedis() 建立，其他檔案再透過 getRedisClient() 取得。
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

    // createClient 只是建立 client 物件，真正連線要等下面的 client.connect()。
    client = createClient({
      url: redisUrl,
      socket: {
        // Redis 短暫斷線時，node-redis 會自動重試。
        // retries 越多等待越久，但最多等 3000ms。
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
    });

    // error event 一定要監聽，否則 Redis 連線錯誤可能讓 Node process 掛掉。
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
  // routes 裡會呼叫這個 function 取得目前 Redis client。
  // 如果 connectRedis() 失敗，這裡會回傳 null。
  return client;
}

module.exports = {
  connectRedis,
  getRedisClient,
};
