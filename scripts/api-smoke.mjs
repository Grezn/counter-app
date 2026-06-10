#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const REQUEST_TIMEOUT_MS = Number(process.env.API_SMOKE_TIMEOUT_MS || 12000);
const START_TIMEOUT_MS = Number(process.env.API_SMOKE_START_TIMEOUT_MS || 18000);
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

let child = null;
let childLogs = "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJsonHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function request(baseUrl, endpoint, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(new URL(endpoint, baseUrl), {
      method: options.method || "GET",
      headers: options.body ? getJsonHeaders() : { Accept: "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = text;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = text;
    }

    return {
      contentType: response.headers.get("content-type") || "",
      data,
      ok: response.ok,
      status: response.status,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function isAppReachable(baseUrl) {
  try {
    const health = await request(baseUrl, "/health", { timeoutMs: 2500 });
    return health.status === 200;
  } catch {
    return false;
  }
}

async function startTemporaryApp() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  child = spawn(process.execPath, ["server.js"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      APP_VERSION: process.env.APP_VERSION || "api-smoke",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => {
    childLogs += chunk.toString();
    childLogs = childLogs.slice(-8000);
  });
  child.stderr.on("data", (chunk) => {
    childLogs += chunk.toString();
    childLogs = childLogs.slice(-8000);
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (await isAppReachable(baseUrl)) {
      return baseUrl;
    }

    if (child.exitCode !== null) {
      throw new Error(`Temporary app exited before /health responded.\n${childLogs}`);
    }

    await sleep(350);
  }

  throw new Error(`Timed out waiting for temporary app at ${baseUrl}.\n${childLogs}`);
}

async function stopTemporaryApp() {
  if (!child || child.exitCode !== null) return;

  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    sleep(3000).then(() => false),
  ]);

  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

function assert(condition, message, details) {
  if (condition) return;

  const error = new Error(message);
  if (details !== undefined) error.details = details;
  throw error;
}

function assertStatus(result, expected, label) {
  assert(
    result.status === expected,
    `${label} expected HTTP ${expected}, got ${result.status}`,
    result.data,
  );
}

function assertJson(result, label) {
  assert(
    result.contentType.includes("application/json") || typeof result.data === "object",
    `${label} did not return JSON`,
    result.text,
  );
}

function isLocalBaseUrl(baseUrl) {
  const url = new URL(baseUrl);
  return LOCAL_HOSTS.has(url.hostname);
}

async function smokeHealth(baseUrl) {
  const health = await request(baseUrl, "/health");
  const ready = await request(baseUrl, "/ready");
  const whoami = await request(baseUrl, "/whoami");

  assertStatus(health, 200, "/health");
  assertStatus(ready, 200, "/ready");
  assertStatus(whoami, 200, "/whoami");
  assert(health.data.status === "ok", "/health status should be ok", health.data);
  assert(ready.data.status === "ready", "/ready status should be ready", ready.data);
  assert(whoami.data.app === "counter-app", "/whoami app should be counter-app", whoami.data);

  return {
    readyRedis: ready.data.redis,
    version: whoami.data.version,
  };
}

async function smokeFrontendShell(baseUrl) {
  const root = await request(baseUrl, "/", {
    timeoutMs: 6000,
  });

  assertStatus(root, 200, "GET /");
  assert(
    typeof root.text === "string" && root.text.includes("<div id=\"app\"></div>"),
    "GET / should return the Vue app shell. Run npm run build first.",
  );
  assert(
    root.text.includes("/assets/index-"),
    "GET / should reference Vite build assets. Run npm run build first.",
  );

  return {
    bytes: root.text.length,
  };
}

async function smokeVisitorStats(baseUrl) {
  const visitorId = `api-smoke-${Date.now()}`;
  const view = await request(baseUrl, "/api/visitor-stats/views", {
    method: "POST",
    body: { visitorId },
  });
  const stats = await request(baseUrl, "/api/visitor-stats");
  const heartbeat = await request(baseUrl, "/api/visitor-stats/heartbeat", {
    method: "POST",
    body: { visitorId },
  });

  assertStatus(view, 200, "POST /api/visitor-stats/views");
  assertStatus(stats, 200, "GET /api/visitor-stats");
  assertStatus(heartbeat, 200, "POST /api/visitor-stats/heartbeat");
  assert(Number.isFinite(Number(stats.data.totalVisitors)), "visitor stats should include totalVisitors", stats.data);
  assert(Number.isFinite(Number(heartbeat.data.activeVisitors)), "heartbeat should include activeVisitors", heartbeat.data);

  return {
    redis: stats.data.redis,
    storage: stats.data.storage || "redis",
  };
}

async function smokeRunbooks(baseUrl) {
  const all = await request(baseUrl, "/api/runbooks");
  const category = await request(baseUrl, "/api/runbooks?category=akamai");
  const keyword = await request(baseUrl, "/api/runbooks?q=Subnet");

  assertStatus(all, 200, "GET /api/runbooks");
  assertStatus(category, 200, "GET /api/runbooks?category=akamai");
  assertStatus(keyword, 200, "GET /api/runbooks?q=Subnet");
  assert(all.data.total >= 1, "runbooks should include at least one item", all.data);
  assert(category.data.runbooks.every((item) => item.category === "akamai"), "category filter should only return Akamai runbooks", category.data);
  assert(keyword.data.filtered >= 1, "keyword search should find at least one runbook", keyword.data);

  return {
    total: all.data.total,
    categoryFiltered: category.data.filtered,
    keywordFiltered: keyword.data.filtered,
  };
}

async function smokeIncidents(baseUrl) {
  if (!isLocalBaseUrl(baseUrl) && process.env.API_SMOKE_ALLOW_REMOTE_WRITES !== "1") {
    const list = await request(baseUrl, "/api/incidents?view=open&limit=1");
    assertStatus(list, 200, "GET /api/incidents");
    return {
      skippedWrites: true,
      view: list.data.view,
    };
  }

  let incidentId = "";
  try {
    const createBody = {
      incident: {
        fields: {
          customer: "Codex",
          nextStep: "Verify API smoke create path",
          severity: "Warning / 警告",
          status: "Triage / 初步判斷",
          system: "local test",
          title: "API smoke incident",
        },
        checks: { "查閱對應 SOP": true },
        followups: {},
        radios: {},
      },
      handoverSummary: "API smoke handover summary",
    };
    const created = await request(baseUrl, "/api/incidents", {
      method: "POST",
      body: createBody,
    });
    assertStatus(created, 201, "POST /api/incidents");
    incidentId = created.data.incident?.id;
    assert(incidentId, "created incident should include id", created.data);

    const updateBody = {
      ...createBody,
      incident: {
        ...createBody.incident,
        fields: {
          ...createBody.incident.fields,
          nextStep: "Verify API smoke update path",
          status: "Waiting / 等待回覆",
          title: "API smoke incident updated",
        },
      },
      handoverSummary: "API smoke handover summary updated",
    };
    const updated = await request(baseUrl, `/api/incidents/${encodeURIComponent(incidentId)}`, {
      method: "PUT",
      body: updateBody,
    });
    const resolved = await request(baseUrl, `/api/incidents/${encodeURIComponent(incidentId)}/resolve`, {
      method: "PATCH",
    });
    const allList = await request(baseUrl, "/api/incidents?view=all&limit=50");
    const openList = await request(baseUrl, "/api/incidents?view=open&limit=50");

    assertStatus(updated, 200, "PUT /api/incidents/:id");
    assertStatus(resolved, 200, "PATCH /api/incidents/:id/resolve");
    assertStatus(allList, 200, "GET /api/incidents?view=all");
    assertStatus(openList, 200, "GET /api/incidents?view=open");
    assert(resolved.data.incident?.status === "Resolved / 已解決", "resolved incident should have resolved status", resolved.data);
    assert(allList.data.incidents.some((item) => item.id === incidentId), "all incident list should include resolved record", allList.data);
    assert(!openList.data.incidents.some((item) => item.id === incidentId), "open incident list should exclude resolved record", openList.data);

    return {
      id: incidentId,
      storage: created.data.storage,
    };
  } finally {
    if (incidentId) {
      const deleted = await request(baseUrl, `/api/incidents/${encodeURIComponent(incidentId)}`, {
        method: "DELETE",
      });
      assertStatus(deleted, 200, "DELETE /api/incidents/:id");
      const afterDelete = await request(baseUrl, "/api/incidents?view=all&limit=50");
      assertStatus(afterDelete, 200, "GET /api/incidents?view=all after delete");
      assert(
        !afterDelete.data.incidents.some((item) => item.id === incidentId),
        "deleted incident should be removed from all incident list",
        afterDelete.data,
      );
    }
  }
}

async function smokeJira(baseUrl) {
  const status = await request(baseUrl, "/api/jira/status");
  const createWithoutSummary = await request(baseUrl, "/api/jira/issues", {
    method: "POST",
    body: {},
  });

  assertStatus(status, 200, "GET /api/jira/status");
  assertJson(status, "GET /api/jira/status");
  assert(
    [400, 503].includes(createWithoutSummary.status),
    "POST /api/jira/issues without summary should return validation/config JSON",
    createWithoutSummary.data,
  );
  assertJson(createWithoutSummary, "POST /api/jira/issues validation");

  return {
    configured: status.data.configured,
    missing: status.data.missing || [],
    validationStatus: createWithoutSummary.status,
  };
}

async function smokeWeather(baseUrl) {
  const weather = await request(baseUrl, "/api/weather/local?manual=1&locationName=%E6%96%B0%E5%8C%97%E5%B8%82%20%E8%98%86%E6%B4%B2%E5%8D%80", {
    timeoutMs: Number(process.env.API_SMOKE_WEATHER_TIMEOUT_MS || 16000),
  });

  assertStatus(weather, 200, "GET /api/weather/local");
  assertJson(weather, "GET /api/weather/local");
  assert(weather.data.current, "weather endpoint should include a current weather object", weather.data);
  assert(weather.data.source, "weather endpoint should identify the weather source", weather.data);

  return {
    source: weather.data.source || "",
    status: weather.status,
    hasCurrent: Boolean(weather.data.current),
  };
}

async function main() {
  let baseUrl = process.env.API_SMOKE_BASE_URL || process.env.COUNTER_APP_BASE_URL || DEFAULT_BASE_URL;
  let startedTemporaryApp = false;

  if (!(await isAppReachable(baseUrl))) {
    assert(
      process.env.API_SMOKE_START_SERVER !== "0",
      `App is not reachable at ${baseUrl}. Start it with npm start or unset API_SMOKE_START_SERVER=0.`,
    );
    baseUrl = await startTemporaryApp();
    startedTemporaryApp = true;
  }

  try {
    const summary = {
      baseUrl,
      startedTemporaryApp,
      frontend: await smokeFrontendShell(baseUrl),
      health: await smokeHealth(baseUrl),
      incidents: await smokeIncidents(baseUrl),
      jira: await smokeJira(baseUrl),
      runbooks: await smokeRunbooks(baseUrl),
      visitorStats: await smokeVisitorStats(baseUrl),
      weather: await smokeWeather(baseUrl),
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await stopTemporaryApp();
  }
}

main().catch(async (err) => {
  console.error("[api-smoke] failed:", err.message);
  if (err.details !== undefined) {
    console.error(JSON.stringify(err.details, null, 2));
  }
  if (childLogs) {
    console.error("--- app logs ---");
    console.error(childLogs);
  }
  await stopTemporaryApp();
  process.exit(1);
});
