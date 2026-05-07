const express = require("express");

const router = express.Router();

const CWA_BASE_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";
const DEFAULT_CITY_DATASET_ID = "F-C0032-001";
const DEFAULT_TOWNSHIP_DATASET_ID = "F-D0047-089";
const DEFAULT_LOCATION_NAME = "臺北市";
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_LOCATION_DISTANCE_KM = 80;

const weatherCache = new Map();

function normalizeText(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizeCacheTtl(value) {
  const ttl = Number(value || DEFAULT_CACHE_TTL_MS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_CACHE_TTL_MS;
}

function normalizeDistance(value) {
  const distance = Number(value || DEFAULT_MAX_LOCATION_DISTANCE_KM);
  return Number.isFinite(distance) && distance > 0 ? distance : DEFAULT_MAX_LOCATION_DISTANCE_KM;
}

function normalizeCwaUnit(unit, fallback = "") {
  const normalized = normalizeText(unit, fallback);
  if (normalized === "攝氏度") return "C";
  if (normalized === "百分比") return "%";
  return normalized;
}

function normalizeCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function hasValidCoordinates(lat, lon) {
  return lat !== null && lon !== null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function getWeatherConfig() {
  return {
    apiKey: normalizeText(process.env.CWA_API_KEY),
    cityDatasetId: normalizeText(
      process.env.CWA_CITY_DATASET_ID || process.env.CWA_DATASET_ID,
      DEFAULT_CITY_DATASET_ID,
    ),
    townshipDatasetId: normalizeText(process.env.CWA_TOWNSHIP_DATASET_ID, DEFAULT_TOWNSHIP_DATASET_ID),
    locationName: normalizeText(process.env.CWA_LOCATION_NAME, DEFAULT_LOCATION_NAME),
    cacheTtlMs: normalizeCacheTtl(process.env.CWA_CACHE_TTL_MS),
    maxLocationDistanceKm: normalizeDistance(process.env.CWA_MAX_LOCATION_DISTANCE_KM),
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

function getCachedWeather(cacheKey) {
  const cached = weatherCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    weatherCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function setCachedWeather(cacheKey, payload, ttlMs) {
  weatherCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    payload,
  });
}

function parseCityForecast(data, requestedLocationName, datasetId) {
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
    forecastLevel: "city",
    locationName: location.locationName || requestedLocationName,
    startTime: firstTime.startTime || "",
    endTime: firstTime.endTime || "",
    weather: getFirstParameter(wx).parameterName || "",
    rainProbability: getFirstParameter(pop).parameterName || "",
    rainProbabilityUnit: normalizeCwaUnit(getFirstParameter(pop).parameterUnit, "%"),
    minTemperature: minTParam.parameterName || "",
    maxTemperature: maxTParam.parameterName || "",
    temperatureUnit: normalizeCwaUnit(minTParam.parameterUnit || maxTParam.parameterUnit, "C"),
    comfort: getFirstParameter(ci).parameterName || "",
    fetchedAt: new Date().toISOString(),
  };
}

function getRecordLocations(data) {
  const records = data && data.records ? data.records : {};
  return Array.isArray(records.locations)
    ? records.locations
    : Array.isArray(records.Locations)
      ? records.Locations
      : [];
}

function flattenTownshipLocations(data) {
  return getRecordLocations(data).flatMap((group) => {
    const countyName = group.locationsName || group.LocationsName || group.locationName || group.LocationName || "";
    const locations = Array.isArray(group.location)
      ? group.location
      : Array.isArray(group.Location)
        ? group.Location
        : [];

    return locations.map((location) => ({
      ...location,
      countyName,
    }));
  });
}

function getWeatherElements(location) {
  return Array.isArray(location.weatherElement)
    ? location.weatherElement
    : Array.isArray(location.WeatherElement)
      ? location.WeatherElement
      : [];
}

function findWeatherElement(location, names) {
  const wanted = new Set(names);
  return getWeatherElements(location).find((element) => (
    wanted.has(element.elementName || element.ElementName)
  ));
}

function getForecastTimes(element) {
  return element && Array.isArray(element.time)
    ? element.time
    : element && Array.isArray(element.Time)
      ? element.Time
      : [];
}

function readElementValue(time, preferredKeys = []) {
  const values = Array.isArray(time.elementValue)
    ? time.elementValue
    : Array.isArray(time.ElementValue)
      ? time.ElementValue
      : [];

  for (const item of values) {
    for (const key of preferredKeys) {
      if (item[key] !== undefined && item[key] !== null && item[key] !== "") {
        return {
          value: String(item[key]),
          unit: item.measures || item.Measures || item.unit || item.Unit || "",
        };
      }
    }

    if (item.value !== undefined && item.value !== null && item.value !== "") {
      return {
        value: String(item.value),
        unit: item.measures || item.Measures || item.unit || item.Unit || "",
      };
    }
  }

  const parameter = time.parameter || time.Parameter;
  if (parameter && parameter.parameterName) {
    return {
      value: String(parameter.parameterName),
      unit: parameter.parameterUnit || "",
    };
  }

  return { value: "", unit: "" };
}

function getTownshipForecastValue(location, elementNames, preferredKeys) {
  const element = findWeatherElement(location, elementNames);
  const time = getForecastTimes(element)[0] || {};
  const value = readElementValue(time, preferredKeys);

  return {
    ...value,
    startTime: time.startTime || time.StartTime || time.dataTime || time.DataTime || "",
    endTime: time.endTime || time.EndTime || "",
  };
}

function getLocationNumber(location, keys) {
  for (const key of keys) {
    const value = normalizeCoordinate(location[key]);
    if (value !== null) return value;
  }

  return null;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const toRadians = (degree) => degree * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestTownship(data, lat, lon) {
  return flattenTownshipLocations(data).reduce((nearest, location) => {
    const locationLat = getLocationNumber(location, ["latitude", "Latitude", "lat", "Lat"]);
    const locationLon = getLocationNumber(location, ["longitude", "Longitude", "lon", "Lon"]);

    if (locationLat === null || locationLon === null) return nearest;

    const distanceKm = getDistanceKm(lat, lon, locationLat, locationLon);
    if (!nearest || distanceKm < nearest.distanceKm) {
      return {
        location,
        latitude: locationLat,
        longitude: locationLon,
        distanceKm,
      };
    }

    return nearest;
  }, null);
}

function parseTownshipForecast(data, lat, lon, datasetId, maxDistanceKm) {
  const nearest = findNearestTownship(data, lat, lon);
  if (!nearest || nearest.distanceKm > maxDistanceKm) return null;

  const location = nearest.location;
  const weather = getTownshipForecastValue(location, ["Wx"], ["Weather", "weather"]);
  const description = getTownshipForecastValue(
    location,
    ["WeatherDescription"],
    ["WeatherDescription", "weatherDescription"],
  );
  const temperature = getTownshipForecastValue(location, ["T"], ["Temperature", "temperature"]);
  const minTemperature = getTownshipForecastValue(location, ["MinT"], ["MinTemperature", "minTemperature"]);
  const maxTemperature = getTownshipForecastValue(location, ["MaxT"], ["MaxTemperature", "maxTemperature"]);
  const rain = getTownshipForecastValue(
    location,
    ["PoP12h", "PoP6h", "PoP"],
    ["ProbabilityOfPrecipitation", "probabilityOfPrecipitation"],
  );
  const comfort = getTownshipForecastValue(
    location,
    ["CI"],
    ["ComfortIndexDescription", "comfortIndexDescription", "ComfortIndex", "comfortIndex"],
  );
  const firstPeriod = weather.startTime || temperature.startTime || rain.startTime
    ? weather.startTime ? weather : temperature.startTime ? temperature : rain
    : {};

  return {
    configured: true,
    source: "中央氣象署氣象資料開放平台",
    datasetId,
    forecastLevel: "township",
    locationName: location.locationName || location.LocationName || "",
    countyName: location.countyName || "",
    startTime: firstPeriod.startTime || "",
    endTime: firstPeriod.endTime || "",
    weather: weather.value || "",
    weatherDescription: description.value || "",
    rainProbability: rain.value || "",
    rainProbabilityUnit: normalizeCwaUnit(rain.unit, "%"),
    temperature: temperature.value || "",
    minTemperature: minTemperature.value || "",
    maxTemperature: maxTemperature.value || "",
    temperatureUnit: normalizeCwaUnit(temperature.unit || minTemperature.unit || maxTemperature.unit, "C"),
    comfort: comfort.value || "",
    matchedDistanceKm: Math.round(nearest.distanceKm * 10) / 10,
    matchedLatitude: nearest.latitude,
    matchedLongitude: nearest.longitude,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchCwaDataset(datasetId, apiKey, searchParams = {}) {
  const url = new URL(`${CWA_BASE_URL}/${encodeURIComponent(datasetId)}`);
  url.searchParams.set("Authorization", apiKey);
  url.searchParams.set("format", "JSON");

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

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

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCityWeather(config, locationName) {
  const data = await fetchCwaDataset(config.cityDatasetId, config.apiKey, { locationName });
  const forecast = parseCityForecast(data, locationName, config.cityDatasetId);
  if (!forecast) {
    const error = new Error("city weather forecast not found");
    error.status = 502;
    throw error;
  }

  return forecast;
}

async function fetchTownshipWeather(config, lat, lon) {
  const data = await fetchCwaDataset(config.townshipDatasetId, config.apiKey, {
    elementName: "T,MinT,MaxT,Wx,PoP12h,PoP6h,PoP,CI,WeatherDescription",
  });
  const forecast = parseTownshipForecast(
    data,
    lat,
    lon,
    config.townshipDatasetId,
    config.maxLocationDistanceKm,
  );

  if (!forecast) {
    const error = new Error("location is outside supported Taiwan township forecast area");
    error.status = 422;
    throw error;
  }

  return forecast;
}

router.get("/api/weather/local", async (req, res) => {
  const config = getWeatherConfig();
  const locationName = normalizeText(req.query.locationName, config.locationName);
  const lat = normalizeCoordinate(req.query.lat);
  const lon = normalizeCoordinate(req.query.lon);
  const useCoordinates = hasValidCoordinates(lat, lon);

  if (!config.apiKey) {
    return res.status(503).json({
      configured: false,
      missing: ["CWA_API_KEY"],
      locationName,
      datasetId: useCoordinates ? config.townshipDatasetId : config.cityDatasetId,
    });
  }

  const cacheKey = useCoordinates
    ? `${config.townshipDatasetId}:geo:${lat.toFixed(3)}:${lon.toFixed(3)}`
    : `${config.cityDatasetId}:city:${locationName}`;
  const forceRefresh = req.query.refresh === "1";
  const cached = forceRefresh ? null : getCachedWeather(cacheKey);

  if (cached) {
    return res.json({
      ...cached,
      cached: true,
    });
  }

  try {
    let forecast;

    if (useCoordinates) {
      try {
        forecast = await fetchTownshipWeather(config, lat, lon);
      } catch (err) {
        if (err.status !== 422) throw err;
        forecast = {
          ...await fetchCityWeather(config, locationName),
          fallbackReason: "coordinates outside township forecast area",
        };
      }
    } else {
      forecast = await fetchCityWeather(config, locationName);
    }

    setCachedWeather(cacheKey, forecast, config.cacheTtlMs);

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
      datasetId: useCoordinates ? config.townshipDatasetId : config.cityDatasetId,
    });
  }
});

module.exports = router;
