const express = require("express");

const router = express.Router();

const CWA_BASE_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";
const DEFAULT_CITY_DATASET_ID = "F-C0032-001";
const DEFAULT_TOWNSHIP_DATASET_ID = "F-D0047-089";
const DEFAULT_OBSERVATION_DATASET_ID = "O-A0001-001";
const DEFAULT_LOCATION_NAME = "臺北市";
const DEFAULT_CACHE_TTL_MS = 3 * 60 * 1000;
const DEFAULT_MAX_LOCATION_DISTANCE_KM = 80;
const DEFAULT_MAX_OBSERVATION_DISTANCE_KM = 80;

const weatherCache = new Map();
const TOWNSHIP_ELEMENT_ALIASES = {
  weather: ["Wx", "Weather", "天氣現象"],
  description: ["WeatherDescription", "天氣預報綜合描述"],
  temperature: ["T", "Temperature", "溫度"],
  minTemperature: ["MinT", "MinTemperature", "最低溫度"],
  maxTemperature: ["MaxT", "MaxTemperature", "最高溫度"],
  rain: ["PoP12h", "PoP6h", "PoP", "ProbabilityOfPrecipitation", "3小時降雨機率", "6小時降雨機率", "12小時降雨機率"],
  comfort: ["CI", "ComfortIndex", "ComfortIndexDescription", "舒適度指數"],
};
const TOWNSHIP_ELEMENT_QUERY = [
  ...TOWNSHIP_ELEMENT_ALIASES.temperature,
  ...TOWNSHIP_ELEMENT_ALIASES.minTemperature,
  ...TOWNSHIP_ELEMENT_ALIASES.maxTemperature,
  ...TOWNSHIP_ELEMENT_ALIASES.weather,
  ...TOWNSHIP_ELEMENT_ALIASES.rain,
  ...TOWNSHIP_ELEMENT_ALIASES.comfort,
  ...TOWNSHIP_ELEMENT_ALIASES.description,
].join(",");

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

function normalizeWeatherElementName(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePlaceName(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/台/g, "臺")
    .toLowerCase();
}

function normalizeCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function normalizeObservationText(value) {
  const text = normalizeText(value);
  const invalidValues = new Set(["-99", "-99.0", "-999", "-999.0", "NA", "N/A", "null", "None", "X", "/"]);
  return invalidValues.has(text) ? "" : text;
}

function normalizeObservationNumber(value) {
  const text = normalizeObservationText(value);
  if (!text) return "";

  const number = Number(text);
  if (!Number.isFinite(number)) return "";

  return Math.round(number * 10) / 10;
}

function normalizeHumidity(value) {
  const humidity = normalizeObservationNumber(value);
  if (humidity === "") return "";

  return humidity <= 1 ? Math.round(humidity * 100) : Math.round(humidity);
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
    observationDatasetId: normalizeText(process.env.CWA_OBSERVATION_DATASET_ID, DEFAULT_OBSERVATION_DATASET_ID),
    locationName: normalizeText(process.env.CWA_LOCATION_NAME, DEFAULT_LOCATION_NAME),
    cacheTtlMs: normalizeCacheTtl(process.env.CWA_CACHE_TTL_MS),
    maxLocationDistanceKm: normalizeDistance(process.env.CWA_MAX_LOCATION_DISTANCE_KM),
    maxObservationDistanceKm: normalizeDistance(
      process.env.CWA_MAX_OBSERVATION_DISTANCE_KM || DEFAULT_MAX_OBSERVATION_DISTANCE_KM,
    ),
  };
}

function readPathValue(source, path) {
  return path.split(".").reduce((value, key) => {
    if (value === undefined || value === null) return undefined;
    return value[key];
  }, source);
}

function readFirstPathValue(source, paths) {
  for (const path of paths) {
    const value = readPathValue(source, path);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function readObservationArrayValue(station, names) {
  const rawElements = station.WeatherElement || station.weatherElement || station.weatherElements || [];
  const elements = Array.isArray(rawElements) ? rawElements : [];
  const wanted = new Set(names.map(normalizeWeatherElementName));
  const matched = elements.find((element) => (
    wanted.has(normalizeWeatherElementName(element.elementName || element.ElementName || element.name))
  ));

  if (!matched) return "";

  const time = Array.isArray(matched.time)
    ? matched.time[0]
    : Array.isArray(matched.Time)
      ? matched.Time[0]
      : null;
  if (time) {
    const value = readElementValue(time, [
      "value",
      "Value",
      "parameterName",
      "ParameterName",
      "Temperature",
      "AirTemperature",
      "Precipitation",
    ]);
    if (value.value) return value.value;
  }

  const parameter = matched.parameter || matched.Parameter || {};
  return matched.value
    || matched.Value
    || matched.valueName
    || parameter.parameterName
    || parameter.ParameterName
    || "";
}

function readObservationValue(station, names, paths = []) {
  const directValue = readFirstPathValue(station, paths);
  if (directValue !== "") return directValue;

  const weatherElement = station.WeatherElement || station.weatherElement || {};
  if (!Array.isArray(weatherElement) && weatherElement && typeof weatherElement === "object") {
    for (const name of names) {
      const value = weatherElement[name];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }

  return readObservationArrayValue(station, names);
}

function getObservationCoordinates(station) {
  const geo = station.GeoInfo || station.geoInfo || {};
  const coordinates = geo.Coordinates || geo.coordinates || geo.Coordinate || [];
  const coordinateList = Array.isArray(coordinates)
    ? coordinates
    : coordinates && typeof coordinates === "object"
      ? [coordinates]
      : [];
  const preferred = coordinateList.find((item) => (
    /wgs84/i.test(String(item.CoordinateName || item.coordinateName || item.name || ""))
  )) || coordinateList[0] || geo;

  const lat = normalizeCoordinate(readFirstPathValue(preferred, [
    "StationLatitude",
    "stationLatitude",
    "Latitude",
    "latitude",
    "lat",
    "Lat",
  ]) || station.lat_wgs84 || station.lat);
  const lon = normalizeCoordinate(readFirstPathValue(preferred, [
    "StationLongitude",
    "stationLongitude",
    "Longitude",
    "longitude",
    "lon",
    "Lon",
  ]) || station.lon_wgs84 || station.lon);

  return { lat, lon };
}

function getObservationRecords(data) {
  const records = data && data.records ? data.records : {};
  if (Array.isArray(records.Station)) return records.Station;
  if (Array.isArray(records.station)) return records.station;
  if (Array.isArray(records.location)) return records.location;
  if (Array.isArray(records.locations)) return records.locations;
  return [];
}

function parseObservationStation(station) {
  const geo = station.GeoInfo || station.geoInfo || {};
  const obsTime = station.ObsTime || station.obsTime || {};
  const { lat, lon } = getObservationCoordinates(station);
  const stationName = normalizeObservationText(station.StationName || station.stationName || station.locationName);

  return {
    stationName,
    stationId: normalizeObservationText(station.StationId || station.stationId || station.stationID || station.locationId),
    observedAt: normalizeObservationText(obsTime.DateTime || obsTime.dateTime || station.obsTime || station.DateTime),
    countyName: normalizeObservationText(geo.CountyName || geo.countyName || station.countyName || station.CountyName),
    townName: normalizeObservationText(geo.TownName || geo.townName || station.townName || station.TownName),
    latitude: lat,
    longitude: lon,
    weather: normalizeObservationText(readObservationValue(station, ["Weather", "Wx"], [
      "WeatherElement.Weather",
      "weatherElement.Weather",
      "Weather",
    ])),
    temperature: normalizeObservationNumber(readObservationValue(station, ["AirTemperature", "TEMP", "T"], [
      "WeatherElement.AirTemperature",
      "WeatherElement.TEMP",
      "weatherElement.AirTemperature",
      "AirTemperature",
      "TEMP",
    ])),
    humidity: normalizeHumidity(readObservationValue(station, ["RelativeHumidity", "HUMD"], [
      "WeatherElement.RelativeHumidity",
      "WeatherElement.HUMD",
      "weatherElement.RelativeHumidity",
      "RelativeHumidity",
      "HUMD",
    ])),
    rainMm: normalizeObservationNumber(readObservationValue(station, ["Precipitation", "H_24R", "Rainfall"], [
      "WeatherElement.Now.Precipitation",
      "WeatherElement.Precipitation",
      "WeatherElement.H_24R",
      "weatherElement.Now.Precipitation",
      "Precipitation",
      "H_24R",
    ])),
    windSpeed: normalizeObservationNumber(readObservationValue(station, ["WindSpeed", "WDSD"], [
      "WeatherElement.WindSpeed",
      "WeatherElement.WDSD",
      "WindSpeed",
      "WDSD",
    ])),
    windDirection: normalizeObservationText(readObservationValue(station, ["WindDirection", "WDIR"], [
      "WeatherElement.WindDirection",
      "WeatherElement.WDIR",
      "WindDirection",
      "WDIR",
    ])),
    airPressure: normalizeObservationNumber(readObservationValue(station, ["AirPressure", "PRES"], [
      "WeatherElement.AirPressure",
      "WeatherElement.PRES",
      "AirPressure",
      "PRES",
    ])),
  };
}

function findBestObservation(data, options) {
  const stations = getObservationRecords(data)
    .map(parseObservationStation)
    .filter((station) => station.stationName);

  if (!stations.length) return null;

  if (hasValidCoordinates(options.lat, options.lon)) {
    const nearest = stations.reduce((best, station) => {
      if (!hasValidCoordinates(station.latitude, station.longitude)) return best;

      const distanceKm = getDistanceKm(options.lat, options.lon, station.latitude, station.longitude);
      if (!best || distanceKm < best.distanceKm) {
        return { ...station, distanceKm: Math.round(distanceKm * 10) / 10 };
      }

      return best;
    }, null);

    if (nearest && nearest.distanceKm <= options.maxDistanceKm) return nearest;
  }

  const locationName = normalizePlaceName(options.locationName);
  const matched = locationName
    ? stations.find((station) => {
        const townName = normalizePlaceName(station.townName);
        const stationName = normalizePlaceName(station.stationName);
        const fullName = normalizePlaceName(`${station.countyName}${station.townName}`);

        return [townName, stationName, fullName].some((part) => (
          part && (part === locationName || locationName.includes(part))
        ));
      })
      || stations.find((station) => {
        const countyName = normalizePlaceName(station.countyName);
        return countyName && countyName === locationName;
      })
      || stations.find((station) => {
        const townName = normalizePlaceName(station.townName);
        const stationName = normalizePlaceName(station.stationName);
        const fullName = normalizePlaceName(`${station.countyName}${station.townName}`);

        return [townName, stationName, fullName].some((part) => part && part.includes(locationName));
      })
    : null;

  return matched || null;
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
  const wanted = new Set(names.map(normalizeWeatherElementName));
  return getWeatherElements(location).find((element) => (
    wanted.has(normalizeWeatherElementName(element.elementName || element.ElementName))
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

  return buildTownshipForecast(
    nearest.location,
    datasetId,
    {
      distanceKm: Math.round(nearest.distanceKm * 10) / 10,
      latitude: nearest.latitude,
      longitude: nearest.longitude,
    },
  );
}

function buildTownshipForecast(location, datasetId, matched = {}) {
  const weather = getTownshipForecastValue(location, TOWNSHIP_ELEMENT_ALIASES.weather, ["Weather", "weather"]);
  const description = getTownshipForecastValue(
    location,
    TOWNSHIP_ELEMENT_ALIASES.description,
    ["WeatherDescription", "weatherDescription"],
  );
  const temperature = getTownshipForecastValue(
    location,
    TOWNSHIP_ELEMENT_ALIASES.temperature,
    ["Temperature", "temperature"],
  );
  const minTemperature = getTownshipForecastValue(
    location,
    TOWNSHIP_ELEMENT_ALIASES.minTemperature,
    ["MinTemperature", "minTemperature"],
  );
  const maxTemperature = getTownshipForecastValue(
    location,
    TOWNSHIP_ELEMENT_ALIASES.maxTemperature,
    ["MaxTemperature", "maxTemperature"],
  );
  const rain = getTownshipForecastValue(
    location,
    TOWNSHIP_ELEMENT_ALIASES.rain,
    ["ProbabilityOfPrecipitation", "probabilityOfPrecipitation"],
  );
  const comfort = getTownshipForecastValue(
    location,
    TOWNSHIP_ELEMENT_ALIASES.comfort,
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
    matchedDistanceKm: matched.distanceKm,
    matchedLatitude: matched.latitude,
    matchedLongitude: matched.longitude,
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
    elementName: TOWNSHIP_ELEMENT_QUERY,
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

function findTownshipByName(data, locationName) {
  const target = normalizePlaceName(locationName);
  if (!target) return null;

  const locations = flattenTownshipLocations(data);
  return locations.find((location) => {
    const countyName = normalizePlaceName(location.countyName);
    const townName = normalizePlaceName(location.locationName || location.LocationName);
    const fullName = `${countyName}${townName}`;

    return fullName === target || target.includes(fullName);
  }) || locations.find((location) => {
    const countyName = normalizePlaceName(location.countyName);
    const townName = normalizePlaceName(location.locationName || location.LocationName);
    const fullName = `${countyName}${townName}`;

    return (townName && target.includes(townName))
      || (fullName && fullName.includes(target))
      || (townName && townName.includes(target));
  });
}

async function fetchTownshipWeatherByName(config, locationName) {
  const data = await fetchCwaDataset(config.townshipDatasetId, config.apiKey, {
    elementName: TOWNSHIP_ELEMENT_QUERY,
  });
  const location = findTownshipByName(data, locationName);

  if (!location) {
    const error = new Error("township weather forecast not found");
    error.status = 404;
    throw error;
  }

  return buildTownshipForecast(location, config.townshipDatasetId);
}

async function fetchObservationWeather(config, options) {
  const data = await fetchCwaDataset(config.observationDatasetId, config.apiKey);
  const observation = findBestObservation(data, {
    lat: options.lat,
    lon: options.lon,
    locationName: options.locationName,
    maxDistanceKm: config.maxObservationDistanceKm,
  });

  if (!observation) return null;

  return {
    ...observation,
    source: "中央氣象署氣象觀測站",
    datasetId: config.observationDatasetId,
  };
}

function buildCurrentWeather(forecast, observation) {
  const current = observation
    ? {
        source: "observation",
        sourceLabel: "最近測站觀測",
        locationName: observation.townName || observation.countyName || forecast.locationName,
        countyName: observation.countyName || forecast.countyName || "",
        stationName: observation.stationName || "",
        stationId: observation.stationId || "",
        observedAt: observation.observedAt || "",
        matchedDistanceKm: observation.distanceKm,
        weather: observation.weather || forecast.weather || forecast.weatherDescription || "",
        temperature: observation.temperature !== "" ? observation.temperature : forecast.temperature,
        humidity: observation.humidity,
        rainMm: observation.rainMm,
        windSpeed: observation.windSpeed,
        windDirection: observation.windDirection,
        airPressure: observation.airPressure,
      }
    : {
        source: "forecast",
        sourceLabel: "預報",
        locationName: forecast.locationName || "",
        countyName: forecast.countyName || "",
        stationName: "",
        stationId: "",
        observedAt: "",
        matchedDistanceKm: "",
        weather: forecast.weather || forecast.weatherDescription || "",
        temperature: forecast.temperature || "",
        humidity: "",
        rainMm: "",
        windSpeed: "",
        windDirection: "",
        airPressure: "",
      };

  return {
    ...current,
    forecastLevel: forecast.forecastLevel || "",
    forecastLocationName: forecast.locationName || "",
    forecastCountyName: forecast.countyName || "",
    forecastStartTime: forecast.startTime || "",
    forecastEndTime: forecast.endTime || "",
    forecastRainProbability: forecast.rainProbability || "",
    forecastRainProbabilityUnit: forecast.rainProbabilityUnit || "%",
    forecastMinTemperature: forecast.minTemperature || "",
    forecastMaxTemperature: forecast.maxTemperature || "",
    forecastTemperatureUnit: forecast.temperatureUnit || "C",
    comfort: forecast.comfort || "",
  };
}

router.get("/api/weather/local", async (req, res) => {
  const config = getWeatherConfig();
  const locationName = normalizeText(req.query.locationName, config.locationName);
  const lat = normalizeCoordinate(req.query.lat);
  const lon = normalizeCoordinate(req.query.lon);
  const useManualLocation = req.query.manual === "1";
  const useCoordinates = !useManualLocation && hasValidCoordinates(lat, lon);

  if (!config.apiKey) {
    return res.status(503).json({
      configured: false,
      missing: ["CWA_API_KEY"],
      locationName,
      datasetId: useCoordinates ? config.townshipDatasetId : config.cityDatasetId,
      hint: "EC2 container 沒有讀到 CWA_API_KEY；請確認 /counter-app/prod/cwa-api-key 和 EC2 IAM Role 的 ssm:GetParameter 權限。",
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

    if (useManualLocation) {
      try {
        forecast = await fetchTownshipWeatherByName(config, locationName);
      } catch (err) {
        const countyName = locationName.split(/\s+/)[0] || locationName;
        forecast = await fetchCityWeather(config, countyName);
        forecast = {
          ...forecast,
          locationName,
          fallbackReason: "manual township forecast not found",
        };
      }
    } else if (useCoordinates) {
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

    let observation = null;
    try {
      observation = await fetchObservationWeather(config, {
        lat,
        lon,
        locationName,
      });
    } catch (err) {
      console.error("[Weather] observation fetch failed:", err.message);
    }

    const payload = {
      ...forecast,
      observation,
      current: buildCurrentWeather(forecast, observation),
    };

    setCachedWeather(cacheKey, payload, config.cacheTtlMs);

    res.json({
      ...payload,
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
