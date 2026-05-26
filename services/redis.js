const { createClient } = require("redis");

// client 是整個 app 共用的 Redis 連線。
// 先在 connectRedis() 建立，其他檔案再透過 getRedisClient() 取得。
let client;
let reconnectTimer;
let connectInProgress = false;
let shuttingDown = false;
const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 3000);
const REDIS_CONNECT_MAX_RETRIES = Number(process.env.REDIS_CONNECT_MAX_RETRIES || 5);
const REDIS_RECONNECT_DELAY_MS = Number(process.env.REDIS_RECONNECT_DELAY_MS || 5000);

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

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRedis();
  }, REDIS_RECONNECT_DELAY_MS);
}

function createRedisClient(redisUrl) {
  const nextClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      // 每次連線嘗試仍有限制；失敗後由 scheduleReconnect() 開新的嘗試。
      reconnectStrategy: (retries) => (
        retries > REDIS_CONNECT_MAX_RETRIES ? false : Math.min(retries * 100, 3000)
      ),
    },
  });

  // error event 一定要監聽，否則 Redis 連線錯誤可能讓 Node process 掛掉。
  nextClient.on("error", (err) => {
    console.error("Redis error:", err.message);
  });

  nextClient.on("end", () => {
    if (!shuttingDown && client === nextClient) {
      client = null;
      scheduleReconnect();
    }
  });

  return nextClient;
}

async function connectRedis() {
  if (connectInProgress || (client && client.isReady)) return;

  connectInProgress = true;

  try {
    const redisUrl = getRedisUrl();

    // createClient 只是建立 client 物件，真正連線要等下面的 client.connect()。
    const nextClient = createRedisClient(redisUrl);
    await nextClient.connect();
    client = nextClient;

    console.log("Redis connected:", getRedisLogLabel(redisUrl));
  } catch (err) {
    client = null;
    console.error("Redis connect failed:", err.message);
    scheduleReconnect();
  } finally {
    connectInProgress = false;
  }
}

function getRedisClient() {
  // routes 裡會呼叫這個 function 取得目前 Redis client。
  // 如果 connectRedis() 失敗，這裡會回傳 null。
  return client;
}

function stopRedisReconnect() {
  shuttingDown = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

module.exports = {
  connectRedis,
  getRedisClient,
  stopRedisReconnect,
};
