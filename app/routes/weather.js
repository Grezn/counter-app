const express = require("express");

const router = express.Router();

const CWA_BASE_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";
const DEFAULT_DATASET_ID = "F-C0032-001";
const DEFAULT_LOCATION_NAME = "臺北市";
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

let weatherCache = {
  key: "",
  expiresAt: 0,
  payload: null,
};

function normalizeText(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizeCacheTtl(value) {
  const ttl = Number(value || DEFAULT_CACHE_TTL_MS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_CACHE_TTL_MS;
}

function getWeatherConfig() {
  return {
    apiKey: normalizeText(process.env.CWA_API_KEY),
    datasetId: normalizeText(process.env.CWA_DATASET_ID, DEFAULT_DATASET_ID),
    locationName: normalizeText(process.env.CWA_LOCATION_NAME, DEFAULT_LOCATION_NAME),
    cacheTtlMs: normalizeCacheTtl(process.env.CWA_CACHE_TTL_MS),
  };
}

function getFirstForecastTime(weatherElement) {
  return weatherElement && Array.isArray(weatherElement.time)
    ? weatherElement.time[0]
    : null;
}

function getFirstParameter(weatherElement) {
  const firstTime = getFirstForecastTime(weatherElement);
  return firstTime && firstTime.parameter ? firstTime.parameter : {};
}

function parseForecast(data, requestedLocationName, datasetId) {
  const locations = data && data.records && Array.isArray(data.records.location)
    ? data.records.location
    : [];

  const location = locations.find((item) => item.locationName === requestedLocationName) || locations[0];
  if (!location || !Array.isArray(location.weatherElement)) return null;

  const elements = new Map(location.weatherElement.map((item) => [item.elementName, item]));
  const wx = elements.get("Wx");
  const pop = elements.get("PoP");
  const minT = elements.get("MinT");
  const maxT = elements.get("MaxT");
  const ci = elements.get("CI");
  const firstTime = getFirstForecastTime(wx || pop || minT || maxT || ci) || {};
  const minTParam = getFirstParameter(minT);
  const maxTParam = getFirstParameter(maxT);

  return {
    configured: true,
    source: "中央氣象署氣象資料開放平台",
    datasetId,
    locationName: location.locationName || requestedLocationName,
    startTime: firstTime.startTime || "",
    endTime: firstTime.endTime || "",
    weather: getFirstParameter(wx).parameterName || "",
    rainProbability: getFirstParameter(pop).parameterName || "",
    rainProbabilityUnit: getFirstParameter(pop).parameterUnit || "%",
    minTemperature: minTParam.parameterName || "",
    maxTemperature: maxTParam.parameterName || "",
    temperatureUnit: minTParam.parameterUnit || maxTParam.parameterUnit || "C",
    comfort: getFirstParameter(ci).parameterName || "",
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchWeather(config, locationName) {
  const url = new URL(`${CWA_BASE_URL}/${encodeURIComponent(config.datasetId)}`);
  url.searchParams.set("Authorization", config.apiKey);
  url.searchParams.set("format", "JSON");
  url.searchParams.set("locationName", locationName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });
    const body = await response.text();
    let data = {};

    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const message = data && data.message ? data.message : "weather upstream error";
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const forecast = parseForecast(data, locationName, config.datasetId);
    if (!forecast) {
      const error = new Error("weather forecast not found");
      error.status = 502;
      throw error;
    }

    return forecast;
  } finally {
    clearTimeout(timeout);
  }
}

router.get("/api/weather/local", async (req, res) => {
  const config = getWeatherConfig();
  const locationName = normalizeText(req.query.locationName, config.locationName);

  if (!config.apiKey) {
    return res.status(503).json({
      configured: false,
      missing: ["CWA_API_KEY"],
      locationName,
      datasetId: config.datasetId,
    });
  }

  const cacheKey = `${config.datasetId}:${locationName}`;
  const forceRefresh = req.query.refresh === "1";
  const now = Date.now();

  if (!forceRefresh && weatherCache.key === cacheKey && weatherCache.payload && weatherCache.expiresAt > now) {
    return res.json({
      ...weatherCache.payload,
      cached: true,
    });
  }

  try {
    const forecast = await fetchWeather(config, locationName);
    weatherCache = {
      key: cacheKey,
      expiresAt: now + config.cacheTtlMs,
      payload: forecast,
    };

    res.json({
      ...forecast,
      cached: false,
    });
  } catch (err) {
    const status = err.name === "AbortError" ? 504 : err.status || 500;
    res.status(status).json({
      configured: true,
      error: status === 504 ? "weather request timeout" : err.message,
      locationName,
      datasetId: config.datasetId,
    });
  }
});

module.exports = router;
