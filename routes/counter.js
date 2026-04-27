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

router.get("/", async (req, res) => {
  let count = 0;

  try {
    const value = await redis.get("counter");
    count = Number(value || 0);
  } catch (err) {
    console.error("[Redis] get counter failed:", err.message);
  }

  const status = getRedisStatus();
  const ok =
    status === "connected" ||
    status === "ready" ||
    status === "reconnecting";

  res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.get("/count", async (req, res) => {
  try {
    const value = await redis.get("counter");
    const count = Number(value || 0);
    const status = getRedisStatus();

    res.json({
      count,
      redis: status,
    });
  } catch (err) {
    console.error("[Redis] get count failed:", err.message);
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