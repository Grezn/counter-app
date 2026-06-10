const CWA_BASE_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_CITY_DATASET_ID = "F-C0032-001";
const DEFAULT_TOWNSHIP_DATASET_ID = "F-D0047-089";
const DEFAULT_OBSERVATION_DATASET_ID = "O-A0001-001";
const DEFAULT_LOCATION_NAME = "臺北市";
const DEFAULT_LOCATION_COORDINATES = { lat: 25.0375, lon: 121.5637, label: "臺北市" };
const DEFAULT_CACHE_TTL_MS = 3 * 60 * 1000;
const DEFAULT_MAX_LOCATION_DISTANCE_KM = 80;
const DEFAULT_MAX_OBSERVATION_DISTANCE_KM = 80;
const DEGRADED_WEATHER_SOURCE = "Local weather degraded response";

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
const FALLBACK_LOCATION_COORDINATES = [
  { name: "基隆市", lat: 25.1276, lon: 121.7392 },
  { name: "臺北市", lat: 25.0375, lon: 121.5637 },
  { name: "新北市", lat: 25.0169, lon: 121.4628 },
  { name: "桃園市", lat: 24.9937, lon: 121.3010 },
  { name: "新竹市", lat: 24.8138, lon: 120.9675 },
  { name: "新竹縣", lat: 24.8392, lon: 121.0020 },
  { name: "苗栗縣", lat: 24.5602, lon: 120.8214 },
  { name: "臺中市", lat: 24.1477, lon: 120.6736 },
  { name: "彰化縣", lat: 24.0818, lon: 120.5380 },
  { name: "南投縣", lat: 23.9609, lon: 120.9719 },
  { name: "雲林縣", lat: 23.7092, lon: 120.4313 },
  { name: "嘉義市", lat: 23.4801, lon: 120.4491 },
  { name: "嘉義縣", lat: 23.4518, lon: 120.2555 },
  { name: "臺南市", lat: 22.9997, lon: 120.2270 },
  { name: "高雄市", lat: 22.6273, lon: 120.3014 },
  { name: "屏東縣", lat: 22.5519, lon: 120.5488 },
  { name: "宜蘭縣", lat: 24.7021, lon: 121.7378 },
  { name: "花蓮縣", lat: 23.9872, lon: 121.6015 },
  { name: "臺東縣", lat: 22.7583, lon: 121.1444 },
  { name: "澎湖縣", lat: 23.5711, lon: 119.5793 },
  { name: "金門縣", lat: 24.4368, lon: 118.3186 },
  { name: "連江縣", lat: 26.1602, lon: 119.9517 },
];
const OPEN_METEO_WEATHER_CODES = new Map([
  [0, "晴"],
  [1, "大致晴朗"],
  [2, "局部多雲"],
  [3, "多雲"],
  [45, "霧"],
  [48, "霧淞"],
  [51, "毛毛雨"],
  [53, "毛毛雨"],
  [55, "毛毛雨"],
  [56, "凍毛毛雨"],
  [57, "凍毛毛雨"],
  [61, "小雨"],
  [63, "雨"],
  [65, "大雨"],
  [66, "凍雨"],
  [67, "凍雨"],
  [71, "小雪"],
  [73, "雪"],
  [75, "大雪"],
  [77, "雪粒"],
  [80, "陣雨"],
  [81, "陣雨"],
  [82, "強陣雨"],
  [85, "陣雪"],
  [86, "強陣雪"],
  [95, "雷雨"],
  [96, "雷雨伴隨冰雹"],
  [99, "雷雨伴隨冰雹"],
]);

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

async function fetchJsonWithTimeout(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
      const error = new Error(data.reason || data.message || "weather fallback upstream error");
      error.status = response.status;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function getOpenMeteoWeatherText(code) {
  return OPEN_METEO_WEATHER_CODES.get(Number(code)) || "天氣資料";
}

function resolveFallbackLocation(locationName, lat, lon) {
  if (hasValidCoordinates(lat, lon)) {
    return {
      lat,
      lon,
      label: locationName || "目前位置",
    };
  }

  const normalizedLocationName = normalizePlaceName(locationName);
  const matched = FALLBACK_LOCATION_COORDINATES.find((item) => {
    const normalizedName = normalizePlaceName(item.name);
    return normalizedLocationName.includes(normalizedName) || normalizedName.includes(normalizedLocationName);
  });

  if (matched) {
    return {
      lat: matched.lat,
      lon: matched.lon,
      label: locationName || matched.name,
    };
  }

  return {
    ...DEFAULT_LOCATION_COORDINATES,
    label: locationName || DEFAULT_LOCATION_COORDINATES.label,
  };
}

function getNearestHourlyIndex(times = [], currentTime = "") {
  const target = Date.parse(currentTime);
  if (!Number.isFinite(target)) return 0;

  return times.reduce((bestIndex, time, index) => {
    const bestDiff = Math.abs(Date.parse(times[bestIndex] || "") - target);
    const nextDiff = Math.abs(Date.parse(time || "") - target);
    if (!Number.isFinite(nextDiff)) return bestIndex;
    if (!Number.isFinite(bestDiff)) return index;
    return nextDiff < bestDiff ? index : bestIndex;
  }, 0);
}

function getNumberRange(values = []) {
  const numbers = values
    .map((value) => Number(value))
    .filter(Number.isFinite);
  if (!numbers.length) return { min: "", max: "" };

  return {
    min: Math.round(Math.min(...numbers)),
    max: Math.round(Math.max(...numbers)),
  };
}

async function fetchFallbackWeather(options) {
  const location = resolveFallbackLocation(options.locationName, options.lat, options.lon);
  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", location.lat.toFixed(5));
  url.searchParams.set("longitude", location.lon.toFixed(5));
  url.searchParams.set("timezone", "Asia/Taipei");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("current", [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "rain",
    "weather_code",
    "wind_speed_10m",
    "wind_direction_10m",
    "pressure_msl",
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m",
    "precipitation_probability",
  ].join(","));

  const data = await fetchJsonWithTimeout(url);
  const current = data.current || {};
  const currentUnits = data.current_units || {};
  const hourly = data.hourly || {};
  const nearestHourlyIndex = getNearestHourlyIndex(hourly.time || [], current.time || "");
  const temperatureRange = getNumberRange(hourly.temperature_2m || []);
  const weatherText = getOpenMeteoWeatherText(current.weather_code);
  const rainMm = current.rain !== undefined && current.rain !== null
    ? current.rain
    : current.precipitation;
  const rainProbability = Array.isArray(hourly.precipitation_probability)
    ? hourly.precipitation_probability[nearestHourlyIndex]
    : "";
  const hasRainProbability = rainProbability !== undefined && rainProbability !== null && rainProbability !== "";

  const forecast = {
    configured: true,
    source: "Open-Meteo fallback",
    fallbackReason: options.fallbackReason || "CWA_API_KEY not configured",
    datasetId: "open-meteo",
    forecastLevel: "fallback",
    locationName: location.label,
    startTime: current.time || "",
    endTime: current.time || "",
    weather: weatherText,
    weatherDescription: weatherText,
    rainProbability: hasRainProbability ? String(rainProbability) : "",
    rainProbabilityUnit: "%",
    temperature: current.temperature_2m !== undefined && current.temperature_2m !== null
      ? String(current.temperature_2m)
      : "",
    minTemperature: temperatureRange.min === "" ? "" : String(temperatureRange.min),
    maxTemperature: temperatureRange.max === "" ? "" : String(temperatureRange.max),
    temperatureUnit: currentUnits.temperature_2m === "°C" ? "C" : normalizeText(currentUnits.temperature_2m, "C"),
    comfort: "",
    fetchedAt: new Date().toISOString(),
  };

  const observation = {
    source: "Open-Meteo fallback",
    locationName: location.label,
    countyName: "",
    stationName: "",
    stationId: "",
    observedAt: current.time || "",
    matchedDistanceKm: "",
    weather: weatherText,
    temperature: current.temperature_2m ?? "",
    humidity: current.relative_humidity_2m ?? "",
    rainMm: rainMm ?? "",
    windSpeed: current.wind_speed_10m ?? "",
    windDirection: current.wind_direction_10m ?? "",
    airPressure: current.pressure_msl ?? "",
  };

  return {
    ...forecast,
    observation,
    current: buildCurrentWeather(forecast, observation),
  };
}

function buildDegradedWeatherPayload(options = {}) {
  const location = resolveFallbackLocation(options.locationName, options.lat, options.lon);
  const fetchedAt = new Date().toISOString();
  const weatherText = "氣象資料暫不可用";
  const forecast = {
    configured: options.configured !== false,
    degraded: true,
    source: DEGRADED_WEATHER_SOURCE,
    fallbackReason: options.fallbackReason || "weather upstream unavailable",
    datasetId: options.datasetId || "weather-degraded",
    forecastLevel: "degraded",
    locationName: location.label,
    countyName: "",
    startTime: "",
    endTime: "",
    weather: weatherText,
    weatherDescription: options.hint || weatherText,
    rainProbability: "",
    rainProbabilityUnit: "%",
    temperature: "",
    minTemperature: "",
    maxTemperature: "",
    temperatureUnit: "C",
    comfort: "",
    fetchedAt,
    cached: false,
    error: options.error || "",
    hint: options.hint || "外部氣象來源暫時不可用，稍後會自動重試。",
    missing: options.missing || [],
    upstreamStatus: options.upstreamStatus || "",
  };
  const observation = {
    source: DEGRADED_WEATHER_SOURCE,
    degraded: true,
    locationName: location.label,
    countyName: "",
    stationName: "",
    stationId: "",
    observedAt: "",
    matchedDistanceKm: "",
    weather: weatherText,
    temperature: "",
    humidity: "",
    rainMm: "",
    windSpeed: "",
    windDirection: "",
    airPressure: "",
  };

  return {
    ...forecast,
    observation,
    current: buildCurrentWeather(forecast, observation),
  };
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
        source: observation.degraded
          ? "degraded"
          : observation.source === "Open-Meteo fallback"
            ? "fallback"
            : "observation",
        sourceLabel: observation.degraded
          ? "氣象資料暫不可用"
          : observation.source === "Open-Meteo fallback"
            ? "備援氣象資料"
            : "最近測站觀測",
        locationName: observation.townName || observation.countyName || forecast.locationName,
        countyName: observation.countyName || forecast.countyName || "",
        stationName: observation.stationName || "",
        stationId: observation.stationId || "",
        observedAt: observation.observedAt || "",
        matchedDistanceKm: observation.distanceKm ?? observation.matchedDistanceKm,
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

async function getLocalWeather(query = {}) {
  const config = getWeatherConfig();
  const locationName = normalizeText(query.locationName, config.locationName);
  const lat = normalizeCoordinate(query.lat);
  const lon = normalizeCoordinate(query.lon);
  const useManualLocation = query.manual === "1";
  const useCoordinates = !useManualLocation && hasValidCoordinates(lat, lon);
  const forceRefresh = query.refresh === "1";

  if (!config.apiKey) {
    const fallbackLocation = resolveFallbackLocation(locationName, lat, lon);
    const fallbackCacheKey = `open-meteo:${fallbackLocation.lat.toFixed(3)}:${fallbackLocation.lon.toFixed(3)}:${fallbackLocation.label}`;
    const cachedFallback = forceRefresh ? null : getCachedWeather(fallbackCacheKey);

    if (cachedFallback) {
      return { status: 200, body: {
        ...cachedFallback,
        cached: true,
      } };
    }

    try {
      const payload = await fetchFallbackWeather({
        locationName,
        lat,
        lon,
      });

      setCachedWeather(fallbackCacheKey, payload, config.cacheTtlMs);

      return { status: 200, body: {
        ...payload,
        cached: false,
      } };
    } catch (err) {
      const status = err.name === "AbortError" ? 504 : err.status || 503;
      return { status: 200, body: {
        ...buildDegradedWeatherPayload({
          configured: false,
          datasetId: "open-meteo",
          error: status === 504 ? "weather fallback request timeout" : err.message,
          fallbackReason: "CWA_API_KEY not configured and fallback weather unavailable",
          hint: "CWA_API_KEY 未設定，且備援氣象來源暫時無法取得資料。",
          lat,
          locationName,
          missing: ["CWA_API_KEY"],
          lon,
          upstreamStatus: status,
        }),
      } };
    }
  }

  const cacheKey = useCoordinates
    ? `${config.townshipDatasetId}:geo:${lat.toFixed(3)}:${lon.toFixed(3)}`
    : `${config.cityDatasetId}:city:${locationName}`;
  const cached = forceRefresh ? null : getCachedWeather(cacheKey);

  if (cached) {
    return { status: 200, body: {
      ...cached,
      cached: true,
    } };
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

    return { status: 200, body: {
      ...payload,
      cached: false,
    } };
  } catch (err) {
    const status = err.name === "AbortError" ? 504 : err.status || 500;

    try {
      const payload = await fetchFallbackWeather({
        fallbackReason: status === 504 ? "CWA weather request timeout" : `CWA weather request failed: ${err.message}`,
        locationName,
        lat,
        lon,
      });

      setCachedWeather(cacheKey, payload, config.cacheTtlMs);

      return { status: 200, body: {
        ...payload,
        cached: false,
      } };
    } catch (fallbackErr) {
      const fallbackStatus = fallbackErr.name === "AbortError" ? 504 : fallbackErr.status || 503;
      return { status: 200, body: {
        ...buildDegradedWeatherPayload({
          configured: true,
          datasetId: useCoordinates ? config.townshipDatasetId : config.cityDatasetId,
          error: fallbackStatus === 504 ? "weather fallback request timeout" : fallbackErr.message,
          fallbackReason: status === 504 ? "CWA weather request timeout" : `CWA weather request failed: ${err.message}`,
          lat,
          locationName,
          lon,
          upstreamStatus: fallbackStatus,
        }),
      } };
    }
  }
}

module.exports = {
  getLocalWeather,
};
