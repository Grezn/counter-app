const express = require("express");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// routes/ 底下放的是「不同功能的網址」。
// counterRoutes 管首頁、計數器、訪客統計；healthRoutes 管健康檢查。
const counterRoutes = require("./routes/counter");
const healthRoutes = require("./routes/health");
const { connectRedis } = require("./services/redis");

// 建立 Express app。你可以把 app 想成「網站伺服器本體」。
const app = express();

// 這些值都可以從環境變數帶進來。
// Docker / EC2 user data 會設定 PORT 和 APP_VERSION。
const PORT = process.env.PORT || 3000;
const APP_VERSION = process.env.APP_VERSION || "v6";

// os.hostname() 在 container 裡通常會是 container id。
// 放進 /whoami 和 log 裡，可以看出目前是哪台 instance/container 回應。
const INSTANCE_ID = os.hostname();
let server;

// 這個服務跑在 AWS ALB 後面，所以要信任 ALB 轉來的 proxy headers。
// 例如 X-Forwarded-For 可以幫我們看見原始使用者 IP。
app.set("trust proxy", true);
app.disable("x-powered-by");

// 基本安全 header。
// 這些 header 不會取代登入，但可以減少瀏覽器端不必要的資訊外流。
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
});

// 這個 app 只需要很小的 JSON，限制大小可以降低被亂塞大 payload 的風險。
app.use(express.json({ limit: "16kb" }));

function writeLog(payload) {
  // 這裡把 log 統一輸出成 JSON，CloudWatch / docker logs 會比較好搜尋。
  // payload 是每次呼叫時額外補上的內容，例如 path/status/latency。
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    app: "counter-app",
    version: APP_VERSION,
    instance: INSTANCE_ID,
    ...payload,
  }));
}

function getClientIp(req) {
  // 使用者先打到 ALB，再由 ALB 轉給 EC2。
  // 真正的使用者 IP 會放在 x-forwarded-for header 裡。
  const xForwardedFor = req.headers["x-forwarded-for"];

  if (xForwardedFor) {
    // x-forwarded-for 可能是一串 IP，第一個通常是最原始的 client IP。
    return xForwardedFor.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "unknown";
}

// 這是一個 Express middleware。
// middleware 會在每個 request 進 route 之前先執行。
// 這段負責產生 request id，並在 response 結束時寫一筆 HTTP log。
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    // finish 事件代表 response 已經送完，這時才知道 status code 和耗時。
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

// public/ 是靜態檔案資料夾。
// 例如 /favicon.svg 會直接從 public/favicon.svg 回傳。
app.use(express.static(path.join(__dirname, "public")));

// /whoami 用來確認目前部署版本。
// 不回傳 container hostname，避免公開暴露太細的執行環境資訊。
app.get("/whoami", (req, res) => {
  res.json({
    app: "counter-app",
    version: APP_VERSION,
  });
});

// 把 routes/counter.js 和 routes/health.js 掛到網站根路徑。
// 例如 counterRoutes 裡的 router.post("/increment") 會變成 /increment。
app.use("/", counterRoutes);
app.use("/", healthRoutes);

async function startServer() {
  // 先連 Redis，再開始 listen。
  // connectRedis 失敗時不會直接讓 process 掛掉，route 會回 redis not available。
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
  // Docker stop / ASG instance refresh 通常會送 SIGTERM。
  // Ctrl+C 本機停止通常會送 SIGINT。
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
