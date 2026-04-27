const express = require("express");
const path = require("path");
const os = require("os");
const counterRoutes = require("./routes/counter");
const healthRoutes = require("./routes/health");
const { connectRedis } = require("./services/redis");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - start;

    console.log(JSON.stringify({
      type: "http",
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latency_ms: ms,
      timestamp: new Date().toISOString()
    }));
  });

  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/whoami", (req, res) => {
  res.json({
    instance: os.hostname()
  });
});

app.use("/", counterRoutes);
app.use("/", healthRoutes);

async function startServer() {
  await connectRedis();

  app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
  });
}

startServer();