const { createClient } = require("redis");

let client;

async function connectRedis() {
  try {
    client = createClient({
      url: process.env.REDIS_URL,
    });

    client.on("error", (err) => {
      console.error("Redis error:", err.message);
    });

    await client.connect();

    console.log("Redis connected");
  } catch (err) {
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