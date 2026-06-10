import { onMounted, onUnmounted, reactive } from "vue";
import { getLocalWeather } from "../api/weather";

const WEATHER_LOCATION_STORAGE_KEY = "msp_weather_location";
const WEATHER_REFRESH_MS = 3 * 60 * 1000;
const WEATHER_POSITION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 5 * 60 * 1000,
};

let weatherPositionCache = null;
let weatherPositionUnavailable = false;

function hasWeatherValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function formatWeatherValue(value, unit = "") {
  return hasWeatherValue(value) ? `${value}${unit}` : "-";
}

function formatWeatherPeriod(startTime, endTime) {
  if (!startTime && !endTime) return "最近一段預報";
  const clean = (value) => String(value || "").replace("T", " ").slice(5, 16);
  const start = clean(startTime);
  const end = clean(endTime);

  if (!start) return end || "最近一段預報";
  if (!end || start === end) return start;

  return `${start} - ${end}`;
}

function formatWeatherTimestamp(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(5, 16);
}

function getWeatherSticker(weatherText) {
  const text = String(weatherText || "");

  if (text.includes("雷")) return { icon: "⛈️", label: "雷雨" };
  if (text.includes("雨")) return { icon: "🌧️", label: "雨天" };
  if (text.includes("雪")) return { icon: "❄️", label: "雪" };
  if (text.includes("霧") || text.includes("靄")) return { icon: "🌫️", label: "霧" };
  if (text.includes("晴") && (text.includes("雲") || text.includes("陰"))) {
    return { icon: "🌤️", label: "晴時多雲" };
  }
  if (text.includes("晴")) return { icon: "☀️", label: "晴天" };
  if (text.includes("陰")) return { icon: "☁️", label: "陰天" };
  if (text.includes("雲")) return { icon: "⛅", label: "多雲" };

  return { icon: "🌡️", label: "天氣" };
}

function formatWeatherLocation(data) {
  const countyName = String(data.countyName || "").trim();
  const locationName = String(data.locationName || "").trim();

  if (countyName && locationName && countyName !== locationName) {
    return `${countyName} ${locationName}`;
  }

  return locationName || countyName || "本地區";
}

function getWeatherLocationOverride() {
  try {
    return (localStorage.getItem(WEATHER_LOCATION_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function setWeatherLocationOverride(value) {
  try {
    const normalized = String(value || "").trim();
    if (normalized) {
      localStorage.setItem(WEATHER_LOCATION_STORAGE_KEY, normalized);
    } else {
      localStorage.removeItem(WEATHER_LOCATION_STORAGE_KEY);
    }
  } catch {
    // Keep the current page usable when localStorage is unavailable.
  }
}

function getWeatherPosition(forceRefresh = false) {
  if (!forceRefresh && weatherPositionCache) {
    return Promise.resolve(weatherPositionCache);
  }

  if (!forceRefresh && weatherPositionUnavailable) {
    return Promise.resolve(null);
  }

  if (!navigator.geolocation || window.isSecureContext === false) {
    weatherPositionUnavailable = true;
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude);
        const lon = Number(position.coords.longitude);

        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          weatherPositionCache = { lat, lon };
          resolve(weatherPositionCache);
          return;
        }

        resolve(null);
      },
      (error) => {
        if (error && error.code === error.PERMISSION_DENIED) {
          weatherPositionUnavailable = true;
        }

        resolve(null);
      },
      WEATHER_POSITION_OPTIONS,
    );
  });
}

function getWeatherRequestDetail(position) {
  const locationOverride = getWeatherLocationOverride();
  if (locationOverride) return `手動地區：${locationOverride}`;
  if (position) return "使用瀏覽器定位尋找最近測站";
  return "沒有定位權限時使用預設地區";
}

function getWeatherLoadingLabel(position) {
  if (getWeatherLocationOverride()) return "更新手動地區氣象...";
  return position ? "更新最近測站氣象..." : "更新預設地區氣象...";
}

function getWeatherUnavailableMessage(data) {
  if (data && data.configured === false) {
    return data.hint || `${formatWeatherLocation(data)} · ${data.datasetId || "F-C0032-001"}`;
  }

  return "";
}

export function useLocalWeather() {
  const weather = reactive({
    ready: false,
    meta: "氣象載入中...",
    placeholder: "氣象載入中...",
    temperature: "-",
    weatherLabel: "天氣資料",
    forecastNote: "",
    sticker: getWeatherSticker(""),
    chips: [
      { label: "現在雨量", value: "-" },
      { label: "未來降雨", value: "-" },
    ],
  });

  let weatherIntervalId = null;

  function setWeatherText(message, detail = "") {
    weather.ready = false;
    weather.placeholder = message;
    weather.meta = detail;
  }

  function applyWeather(data) {
    const current = data.current || {};
    const temperatureUnit = current.forecastTemperatureUnit || data.temperatureUnit || "C";
    const forecastRange = current.forecastMinTemperature || current.forecastMaxTemperature
      ? `${current.forecastMinTemperature || "-"}-${current.forecastMaxTemperature || "-"}°${temperatureUnit}`
      : "";
    const temperature = hasWeatherValue(current.temperature)
      ? `${current.temperature}°${temperatureUnit}`
      : hasWeatherValue(data.temperature)
        ? `${data.temperature}°${temperatureUnit}`
        : forecastRange || "-";
    const rainProbability = hasWeatherValue(current.forecastRainProbability)
      ? current.forecastRainProbability
      : data.rainProbability;
    const rainProbabilityUnit = current.forecastRainProbabilityUnit || data.rainProbabilityUnit || "%";
    const rainText = formatWeatherValue(current.rainMm, "mm");
    const rainProbabilityText = hasWeatherValue(rainProbability)
      ? `${rainProbability}${rainProbabilityUnit}`
      : "-";
    const locationLabel = formatWeatherLocation({
      countyName: current.countyName || data.countyName,
      locationName: current.locationName || data.locationName,
    });
    const observedTime = formatWeatherTimestamp(current.observedAt);
    const forecastTime = formatWeatherPeriod(
      current.forecastStartTime || data.startTime,
      current.forecastEndTime || data.endTime,
    );
    const weatherLabel = current.weather || data.weather || data.weatherDescription || "天氣資料";

    weather.ready = true;
    weather.meta = observedTime ? `${locationLabel} · 觀測 ${observedTime}` : locationLabel;
    weather.temperature = temperature;
    weather.weatherLabel = weatherLabel;
    weather.forecastNote = `預報 ${forecastTime}`;
    weather.sticker = getWeatherSticker(weatherLabel);
    weather.chips = [
      { label: "現在雨量", value: rainText },
      { label: "未來降雨", value: rainProbabilityText },
    ];
  }

  async function loadLocalWeather(forceRefresh = false) {
    try {
      setWeatherText("氣象定位中...", "準備更新最近測站與預報");
      const locationOverride = getWeatherLocationOverride();
      const position = locationOverride ? null : await getWeatherPosition(forceRefresh);
      setWeatherText(getWeatherLoadingLabel(position), getWeatherRequestDetail(position));
      const data = await getLocalWeather({
        refresh: forceRefresh ? "1" : "",
        locationName: locationOverride,
        manual: locationOverride ? "1" : "",
        lat: position ? position.lat.toFixed(5) : "",
        lon: position ? position.lon.toFixed(5) : "",
      });

      applyWeather(data);
    } catch (error) {
      if (error.data && error.data.configured === false) {
        setWeatherText("氣象功能尚未啟用", getWeatherUnavailableMessage(error.data));
        return;
      }

      setWeatherText("氣象資料讀取失敗", error.message);
    }
  }

  function configureWeatherLocation() {
    const current = getWeatherLocationOverride();
    const value = window.prompt("輸入氣象地區，例如：新北市 蘆洲區。留空可改回瀏覽器定位。", current);

    if (value === null) return;

    setWeatherLocationOverride(value);
    weatherPositionCache = null;
    weatherPositionUnavailable = false;
    loadLocalWeather(true);
  }

  onMounted(() => {
    loadLocalWeather();
    weatherIntervalId = window.setInterval(loadLocalWeather, WEATHER_REFRESH_MS);
  });

  onUnmounted(() => {
    if (weatherIntervalId) {
      window.clearInterval(weatherIntervalId);
    }
  });

  return {
    configureWeatherLocation,
    loadLocalWeather,
    weather,
  };
}
