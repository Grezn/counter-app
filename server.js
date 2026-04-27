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

app.use(express.json());

function writeLog(payload) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    app: "counter-app",
    version: APP_VERSION,
    instance: INSTANCE_ID,
    ...payload,
  }));
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
      client_ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
      user_agent: req.headers["user-agent"] || "unknown",
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

  app.listen(PORT, "0.0.0.0", () => {
    writeLog({
      level: "info",
      type: "app",
      event: "server_started",
      port: PORT,
    });
  });
}

startServer();