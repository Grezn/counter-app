import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { getLocalWeather } from "../api/weather";

const WEATHER_LOCATION_STORAGE_KEY = "msp_weather_location";
const WEATHER_REFRESH_MS = 3 * 60 * 1000;
const WEATHER_POSITION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 5 * 60 * 1000,
};
const WEATHER_LOCATION_DISTRICTS = {
  基隆市: ["仁愛區", "信義區", "中正區", "中山區", "安樂區", "暖暖區", "七堵區"],
  臺北市: ["中正區", "大同區", "中山區", "松山區", "大安區", "萬華區", "信義區", "士林區", "北投區", "內湖區", "南港區", "文山區"],
  新北市: ["板橋區", "三重區", "中和區", "永和區", "新莊區", "新店區", "土城區", "蘆洲區", "樹林區", "汐止區", "鶯歌區", "三峽區", "淡水區", "瑞芳區", "五股區", "泰山區", "林口區", "深坑區", "石碇區", "坪林區", "三芝區", "石門區", "八里區", "平溪區", "雙溪區", "貢寮區", "金山區", "萬里區", "烏來區"],
  桃園市: ["桃園區", "中壢區", "平鎮區", "八德區", "楊梅區", "蘆竹區", "大溪區", "龍潭區", "龜山區", "大園區", "觀音區", "新屋區", "復興區"],
  新竹市: ["東區", "北區", "香山區"],
  新竹縣: ["竹北市", "竹東鎮", "新埔鎮", "關西鎮", "湖口鄉", "新豐鄉", "芎林鄉", "橫山鄉", "北埔鄉", "寶山鄉", "峨眉鄉", "尖石鄉", "五峰鄉"],
  苗栗縣: ["苗栗市", "頭份市", "苑裡鎮", "通霄鎮", "竹南鎮", "後龍鎮", "卓蘭鎮", "大湖鄉", "公館鄉", "銅鑼鄉", "南庄鄉", "頭屋鄉", "三義鄉", "西湖鄉", "造橋鄉", "三灣鄉", "獅潭鄉", "泰安鄉"],
  臺中市: ["中區", "東區", "南區", "西區", "北區", "北屯區", "西屯區", "南屯區", "太平區", "大里區", "霧峰區", "烏日區", "豐原區", "后里區", "石岡區", "東勢區", "和平區", "新社區", "潭子區", "大雅區", "神岡區", "大肚區", "沙鹿區", "龍井區", "梧棲區", "清水區", "大甲區", "外埔區", "大安區"],
  彰化縣: ["彰化市", "員林市", "鹿港鎮", "和美鎮", "北斗鎮", "溪湖鎮", "田中鎮", "二林鎮", "線西鄉", "伸港鄉", "福興鄉", "秀水鄉", "花壇鄉", "芬園鄉", "大村鄉", "埔鹽鄉", "埔心鄉", "永靖鄉", "社頭鄉", "二水鄉", "田尾鄉", "埤頭鄉", "芳苑鄉", "大城鄉", "竹塘鄉", "溪州鄉"],
  南投縣: ["南投市", "埔里鎮", "草屯鎮", "竹山鎮", "集集鎮", "名間鄉", "鹿谷鄉", "中寮鄉", "魚池鄉", "國姓鄉", "水里鄉", "信義鄉", "仁愛鄉"],
  雲林縣: ["斗六市", "斗南鎮", "虎尾鎮", "西螺鎮", "土庫鎮", "北港鎮", "古坑鄉", "大埤鄉", "莿桐鄉", "林內鄉", "二崙鄉", "崙背鄉", "麥寮鄉", "東勢鄉", "褒忠鄉", "臺西鄉", "元長鄉", "四湖鄉", "口湖鄉", "水林鄉"],
  嘉義市: ["東區", "西區"],
  嘉義縣: ["太保市", "朴子市", "布袋鎮", "大林鎮", "民雄鄉", "溪口鄉", "新港鄉", "六腳鄉", "東石鄉", "義竹鄉", "鹿草鄉", "水上鄉", "中埔鄉", "竹崎鄉", "梅山鄉", "番路鄉", "大埔鄉", "阿里山鄉"],
  臺南市: ["中西區", "東區", "南區", "北區", "安平區", "安南區", "永康區", "歸仁區", "新化區", "左鎮區", "玉井區", "楠西區", "南化區", "仁德區", "關廟區", "龍崎區", "官田區", "麻豆區", "佳里區", "西港區", "七股區", "將軍區", "學甲區", "北門區", "新營區", "後壁區", "白河區", "東山區", "六甲區", "下營區", "柳營區", "鹽水區", "善化區", "大內區", "山上區", "新市區", "安定區"],
  高雄市: ["楠梓區", "左營區", "鼓山區", "三民區", "鹽埕區", "前金區", "新興區", "苓雅區", "前鎮區", "旗津區", "小港區", "鳳山區", "林園區", "大寮區", "大樹區", "大社區", "仁武區", "鳥松區", "岡山區", "橋頭區", "燕巢區", "田寮區", "阿蓮區", "路竹區", "湖內區", "茄萣區", "永安區", "彌陀區", "梓官區", "旗山區", "美濃區", "六龜區", "甲仙區", "杉林區", "內門區", "茂林區", "桃源區", "那瑪夏區"],
  屏東縣: ["屏東市", "潮州鎮", "東港鎮", "恆春鎮", "萬丹鄉", "長治鄉", "麟洛鄉", "九如鄉", "里港鄉", "鹽埔鄉", "高樹鄉", "萬巒鄉", "內埔鄉", "竹田鄉", "新埤鄉", "枋寮鄉", "新園鄉", "崁頂鄉", "林邊鄉", "南州鄉", "佳冬鄉", "琉球鄉", "車城鄉", "滿州鄉", "枋山鄉", "三地門鄉", "霧臺鄉", "瑪家鄉", "泰武鄉", "來義鄉", "春日鄉", "獅子鄉", "牡丹鄉"],
  宜蘭縣: ["宜蘭市", "羅東鎮", "蘇澳鎮", "頭城鎮", "礁溪鄉", "壯圍鄉", "員山鄉", "冬山鄉", "五結鄉", "三星鄉", "大同鄉", "南澳鄉"],
  花蓮縣: ["花蓮市", "鳳林鎮", "玉里鎮", "新城鄉", "吉安鄉", "壽豐鄉", "光復鄉", "豐濱鄉", "瑞穗鄉", "富里鄉", "秀林鄉", "萬榮鄉", "卓溪鄉"],
  臺東縣: ["臺東市", "成功鎮", "關山鎮", "卑南鄉", "鹿野鄉", "池上鄉", "東河鄉", "長濱鄉", "太麻里鄉", "大武鄉", "綠島鄉", "海端鄉", "延平鄉", "金峰鄉", "達仁鄉", "蘭嶼鄉"],
  澎湖縣: ["馬公市", "湖西鄉", "白沙鄉", "西嶼鄉", "望安鄉", "七美鄉"],
  金門縣: ["金城鎮", "金湖鎮", "金沙鎮", "金寧鄉", "烈嶼鄉", "烏坵鄉"],
  連江縣: ["南竿鄉", "北竿鄉", "莒光鄉", "東引鄉"],
};
const WEATHER_COUNTY_OPTIONS = Object.keys(WEATHER_LOCATION_DISTRICTS);

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

function parseWeatherLocation(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return { county: "", district: "" };

  const county = WEATHER_COUNTY_OPTIONS.find((item) => (
    normalized === item || normalized.startsWith(`${item} `) || normalized.startsWith(item)
  ));

  if (!county) return { county: "", district: "" };

  const district = normalized.slice(county.length).trim();
  const knownDistricts = WEATHER_LOCATION_DISTRICTS[county] || [];

  return {
    county,
    district: knownDistricts.includes(district) ? district : "",
  };
}

function formatWeatherLocationOverride(county, district) {
  return [county, district].filter(Boolean).join(" ");
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
  const savedWeatherLocation = parseWeatherLocation(getWeatherLocationOverride());
  const selectedWeatherCounty = ref(savedWeatherLocation.county);
  const selectedWeatherDistrict = ref(savedWeatherLocation.district);
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
  const weatherDistrictOptions = computed(() => (
    WEATHER_LOCATION_DISTRICTS[selectedWeatherCounty.value] || []
  ));
  const selectedWeatherLocation = computed(() => (
    formatWeatherLocationOverride(selectedWeatherCounty.value, selectedWeatherDistrict.value)
  ));

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
      const locationOverride = selectedWeatherLocation.value || getWeatherLocationOverride();
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

  function applySelectedWeatherLocation() {
    setWeatherLocationOverride(selectedWeatherLocation.value);
    weatherPositionCache = null;
    weatherPositionUnavailable = false;
    loadLocalWeather(true);
  }

  function setWeatherCounty(value) {
    const county = WEATHER_COUNTY_OPTIONS.includes(value) ? value : "";
    selectedWeatherCounty.value = county;

    if (!weatherDistrictOptions.value.includes(selectedWeatherDistrict.value)) {
      selectedWeatherDistrict.value = "";
    }

    applySelectedWeatherLocation();
  }

  function setWeatherDistrict(value) {
    selectedWeatherDistrict.value = weatherDistrictOptions.value.includes(value) ? value : "";
    applySelectedWeatherLocation();
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
    loadLocalWeather,
    selectedWeatherCounty,
    selectedWeatherDistrict,
    selectedWeatherLocation,
    setWeatherCounty,
    setWeatherDistrict,
    weather,
    weatherCountyOptions: WEATHER_COUNTY_OPTIONS,
    weatherDistrictOptions,
  };
}
