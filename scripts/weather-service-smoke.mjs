#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const originalFetch = globalThis.fetch;
const originalCwaApiKey = process.env.CWA_API_KEY;

function assert(condition, message, detail = {}) {
  if (condition) return;

  const error = new Error(message);
  error.detail = detail;
  throw error;
}

async function main() {
  process.env.CWA_API_KEY = "";
  globalThis.fetch = async () => {
    const error = new Error("synthetic weather upstream failure");
    error.status = 503;
    throw error;
  };

  const { getLocalWeather } = require("../services/weather");
  const response = await getLocalWeather({
    locationName: "新北市 蘆洲區",
    manual: "1",
    refresh: "1",
  });

  assert(response.status === 200, "degraded weather response should still be HTTP 200", response);
  assert(response.body?.degraded === true, "degraded weather response should be marked degraded", response.body);
  assert(response.body?.source, "degraded weather response should include a source", response.body);
  assert(response.body?.current, "degraded weather response should include current weather shape", response.body);
  assert(
    response.body.current.source === "degraded",
    "current weather shape should expose degraded source",
    response.body.current,
  );

  console.log(JSON.stringify({
    currentSource: response.body.current.source,
    degraded: response.body.degraded,
    source: response.body.source,
    status: response.status,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    if (error.detail) {
      console.error(JSON.stringify(error.detail, null, 2));
    }
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
    if (originalCwaApiKey === undefined) {
      delete process.env.CWA_API_KEY;
    } else {
      process.env.CWA_API_KEY = originalCwaApiKey;
    }
  });
