const express = require("express");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const counterRoutes = require("./routes/counter");
const healthRoutes = require("./routes/health");
const { connectRedis } = require("./services/redis");

const app = express();

const PORT = process.env.PORT || 3000;
const APP_VERSION = process.env.APP_VERSION || "v6";
const INSTANCE_ID = os.hostname();
let server;

// 這個服務跑在 AWS ALB 後面，所以要信任 ALB 轉來的 proxy headers。
// 例如 X-Forwarded-For 可以幫我們看見原始使用者 IP。
app.set("trust proxy", true);
app.disable("x-powered-by");

// 這個 app 只需要很小的 JSON，限制大小可以降低被亂塞大 payload 的風險。
app.use(express.json({ limit: "16kb" }));

function writeLog(payload) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    app: "counter-app",
    version: APP_VERSION,
    instance: INSTANCE_ID,
    ...payload,
  }));
}

function getClientIp(req) {
  const xForwardedFor = req.headers["x-forwarded-for"];

  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "unknown";
}

app.use((req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const latencyMs = Date.now() - start;

    writeLog({
      level: res.statusCode >= 500 ? "error" : "info",
      type: "http",
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latency_ms: latencyMs,
      client_ip: getClientIp(req),
      user_agent: req.headers["user-agent"] || "unknown",
      host: req.headers["host"] || "unknown",
      referer: req.headers["referer"] || "unknown",
    });
  });

  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/whoami", (req, res) => {
  res.json({
    instance: INSTANCE_ID,
    version: APP_VERSION,
  });
});

app.use("/", counterRoutes);
app.use("/", healthRoutes);

async function startServer() {
  await connectRedis();

  server = app.listen(PORT, "0.0.0.0", () => {
    writeLog({
      level: "info",
      type: "app",
      event: "server_started",
      port: PORT,
    });
  });
}

startServer();

const { getRedisClient } = require("./services/redis");

async function shutdown(signal) {
  writeLog({
    level: "info",
    type: "app",
    event: "shutdown_started",
    signal,
  });

  const client = getRedisClient();

  try {
    // ASG instance refresh 會送 SIGTERM。
    // 先關 HTTP server，讓進行中的請求結束，再關 Redis。
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    if (client && client.isOpen) {
      await client.quit();
    }
  } catch (err) {
    console.error("Shutdown failed:", err.message);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
