// 這個檔案是前端互動邏輯。
// 它會呼叫後端 API，例如 /track-view、/count、/increment、/reset。

let errorHideTimer = null;

function setError(message) {
  // 把錯誤訊息顯示在計數器分頁，並在短暫停留後收掉。
  const box = document.getElementById("errorBox");
  if (!box) return;

  window.clearTimeout(errorHideTimer);
  box.style.display = "block";
  box.textContent = message;

  errorHideTimer = window.setTimeout(() => {
    box.style.display = "none";
    box.textContent = "";
  }, 4500);
}

function clearError() {
  // 每次重新執行 API 前，先把舊錯誤清掉。
  const box = document.getElementById("errorBox");
  if (!box) return;

  window.clearTimeout(errorHideTimer);
  box.style.display = "none";
  box.textContent = "";
}

function setTheme(theme) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;

  try {
    localStorage.setItem("msp_theme", normalizedTheme);
  } catch {
    // 無法寫入 localStorage 時仍允許本次頁面切換主題。
  }

  const lightButton = document.getElementById("themeLightButton");
  const darkButton = document.getElementById("themeDarkButton");

  if (lightButton) {
    lightButton.classList.toggle("active", normalizedTheme === "light");
    lightButton.setAttribute("aria-pressed", String(normalizedTheme === "light"));
  }

  if (darkButton) {
    darkButton.classList.toggle("active", normalizedTheme === "dark");
    darkButton.setAttribute("aria-pressed", String(normalizedTheme === "dark"));
  }
}

function initTheme() {
  let savedTheme = "";

  try {
    savedTheme = localStorage.getItem("msp_theme") || "";
  } catch {
    savedTheme = "";
  }

  setTheme(savedTheme || document.documentElement.dataset.theme || "light");
}

const VIEW_CONFIG = {
  dashboard: {
    hash: "",
    tabId: "dashboardTab",
    viewId: "dashboardView",
  },
  counter: {
    hash: "counter",
    tabId: "counterTab",
    viewId: "counterView",
  },
  runbooks: {
    hash: "sop",
    tabId: "runbooksTab",
    viewId: "runbooksView",
  },
};

function getViewFromHash() {
  const hash = window.location.hash.replace("#", "").toLowerCase();
  if (hash === "sop" || hash === "runbooks" || hash === "runbook") return "runbooks";
  if (hash === "counter" || hash === "count") return "counter";
  return "dashboard";
}

function setActiveView(viewName, options = {}) {
  const activeViewName = VIEW_CONFIG[viewName] ? viewName : "dashboard";

  Object.entries(VIEW_CONFIG).forEach(([name, config]) => {
    const isActive = name === activeViewName;
    const view = document.getElementById(config.viewId);
    const tab = document.getElementById(config.tabId);

    if (view) {
      view.hidden = !isActive;
      view.classList.toggle("active", isActive);
    }

    if (tab) {
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    }
  });

  if (options.updateHash !== false) {
    const hash = VIEW_CONFIG[activeViewName].hash;
    const nextUrl = hash
      ? `${window.location.pathname}${window.location.search}#${hash}`
      : `${window.location.pathname}${window.location.search}`;

    try {
      window.history.pushState(null, "", nextUrl);
    } catch {
      if (hash) {
        window.location.hash = hash;
      }
    }
  }

  if (options.scrollTop !== false) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function initViewTabs() {
  setActiveView(getViewFromHash(), {
    updateHash: false,
    scrollTop: false,
  });

  window.addEventListener("hashchange", () => {
    setActiveView(getViewFromHash(), {
      updateHash: false,
      scrollTop: true,
    });
  });

  window.addEventListener("popstate", () => {
    setActiveView(getViewFromHash(), {
      updateHash: false,
      scrollTop: true,
    });
  });
}

function updateBadge(redisStatus) {
  // 更新畫面左上角的 Redis 狀態 badge。
  // redisStatus 來自後端回傳，例如 ready / connected / error。
  const badge = document.getElementById("redisBadge");
  const okStatuses = ["connected", "ready", "reconnecting"];

  badge.textContent = `Redis: ${redisStatus}`;

  if (okStatuses.includes(redisStatus)) {
    badge.className = "badge ok";
  } else {
    badge.className = "badge error";
  }
}

function getVisitorId() {
  // localStorage 是瀏覽器提供的小型儲存空間。
  // visitor_id 存在這裡，關掉瀏覽器再打開也還在。
  let visitorId = localStorage.getItem("visitor_id");

  if (!visitorId) {
    // 用瀏覽器產生一個匿名 ID，讓同一台瀏覽器不要被重複算成新訪客。
    visitorId = window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("visitor_id", visitorId);
  }

  return visitorId;
}

function getResetToken(promptText = "請輸入 Reset Token") {
  // sessionStorage 只在目前分頁保存。
  // 關掉分頁後 token 會消失，比放 localStorage 安全一點。
  let token = sessionStorage.getItem("reset_token");

  if (!token) {
    // Reset 是高風險操作，所以 token 由使用者輸入，不寫死在 HTML 裡。
    token = prompt(promptText);

    if (token) {
      sessionStorage.setItem("reset_token", token);
    }
  }

  return token;
}

function renderStats(data) {
  // 後端回傳 JSON 後，這裡把數字塞進 HTML 對應的元素。
  // 例如 id="totalVisitors" 的 <div> 會顯示總訪客數。
  document.getElementById("totalVisitors").textContent = data.totalVisitors;
  document.getElementById("todayVisitors").textContent = data.todayVisitors;
  document.getElementById("activeVisitors").textContent = data.activeVisitors;
  document.getElementById("today").textContent = formatDateWithWeekday(data.today);
  updateBadge(data.redis);
}

function renderActiveVisitors(data) {
  if (data && data.activeVisitors !== undefined) {
    document.getElementById("activeVisitors").textContent = data.activeVisitors;
  }

  if (data && data.redis) {
    updateBadge(data.redis);
  }
}

function formatDateWithWeekday(value) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return text || "-";

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return text;

  const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  return `${text}（${weekdays[date.getDay()]}）`;
}

const WEATHER_POSITION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 5 * 60 * 1000,
};
const WEATHER_LOCATION_STORAGE_KEY = "msp_weather_location";

let weatherPositionCache = null;
let weatherPositionUnavailable = false;
let latestWeatherReportText = "";

function setWeatherText(message, detail) {
  const meta = document.getElementById("weatherMeta");
  const content = document.getElementById("weatherContent");
  if (meta) meta.textContent = detail || "";
  if (content) {
    content.replaceChildren(createTextElement("div", "weather-placeholder", message));
  }
  latestWeatherReportText = [detail, message].filter(Boolean).join(" / ");
}

function formatWeatherPeriod(startTime, endTime) {
  if (!startTime && !endTime) return "最近一段預報";
  const clean = (value) => String(value || "").replace("T", " ").slice(5, 16);
  return `${clean(startTime)} - ${clean(endTime)}`;
}

function formatWeatherTimestamp(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(5, 16);
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
    // localStorage 不可用時，維持本次頁面可操作。
  }
}

function configureWeatherLocation() {
  const current = getWeatherLocationOverride();
  const value = prompt("輸入氣象地區，例如：新北市 蘆洲區。留空可改回瀏覽器定位。", current);

  if (value === null) return;

  setWeatherLocationOverride(value);
  weatherPositionCache = null;
  weatherPositionUnavailable = false;
  loadLocalWeather(true);
}

function hasWeatherValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function formatWeatherValue(value, unit = "") {
  return hasWeatherValue(value) ? `${value}${unit}` : "-";
}

function createWeatherChip(label, value) {
  const item = document.createElement("div");
  item.className = "weather-chip";
  item.appendChild(createTextElement("span", "weather-chip-label", label));
  item.appendChild(createTextElement("strong", "weather-chip-value", value || "-"));
  return item;
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

function createWeatherSticker(weatherText) {
  const sticker = getWeatherSticker(weatherText);
  const element = createTextElement("span", "weather-sticker", sticker.icon);
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", sticker.label);
  return element;
}

function formatWeatherLocation(data) {
  const countyName = String(data.countyName || "").trim();
  const locationName = String(data.locationName || "").trim();

  if (countyName && locationName && countyName !== locationName) {
    return `${countyName} ${locationName}`;
  }

  return locationName || countyName || "本地區";
}

function renderLocalWeather(data) {
  const meta = document.getElementById("weatherMeta");
  const content = document.getElementById("weatherContent");
  if (!meta || !content) return;

  const current = data.current || {};
  const temperatureUnit = current.forecastTemperatureUnit || data.temperatureUnit || "C";
  const forecastRange = current.forecastMinTemperature || current.forecastMaxTemperature
    ? `${current.forecastMinTemperature || "-"}-${current.forecastMaxTemperature || "-"}°${temperatureUnit}`
    : "";
  const temperature = hasWeatherValue(current.temperature)
    ? `${current.temperature}°${temperatureUnit}`
    : data.temperature
      ? `${data.temperature}°${temperatureUnit}`
      : forecastRange || "-";
  const rainProbability = current.forecastRainProbability || data.rainProbability;
  const rainProbabilityUnit = current.forecastRainProbabilityUnit || data.rainProbabilityUnit || "%";
  const rainText = formatWeatherValue(current.rainMm, "mm");
  const rainProbabilityText = rainProbability ? `${rainProbability}${rainProbabilityUnit}` : "-";
  const locationLabel = formatWeatherLocation({
    countyName: current.countyName || data.countyName,
    locationName: current.locationName || data.locationName,
  });
  const observedTime = formatWeatherTimestamp(current.observedAt);
  const forecastTime = formatWeatherPeriod(
    current.forecastStartTime || data.startTime,
    current.forecastEndTime || data.endTime,
  );
  meta.textContent = observedTime
    ? `${locationLabel} · 觀測 ${observedTime}`
    : locationLabel;

  const summary = document.createElement("div");
  summary.className = "weather-summary";
  summary.appendChild(createTextElement("strong", "weather-temp", temperature));

  const summaryText = document.createElement("div");
  summaryText.className = "weather-summary-text";
  const weatherLabel = current.weather || data.weather || data.weatherDescription || "天氣資料";
  summaryText.appendChild(createTextElement("span", "weather-now", weatherLabel));
  summaryText.appendChild(createTextElement("span", "weather-forecast-note", `預報 ${forecastTime}`));
  summary.appendChild(summaryText);
  summary.appendChild(createWeatherSticker(weatherLabel));

  content.replaceChildren(
    summary,
    createWeatherChip("現在雨量", rainText),
    createWeatherChip("未來降雨", rainProbabilityText),
  );

  latestWeatherReportText = [
    locationLabel,
    weatherLabel,
    temperature,
    `現在雨量 ${rainText}`,
    `未來降雨 ${rainProbabilityText}`,
    `預報 ${forecastTime}`,
  ].filter(Boolean).join(" / ");
}

function getWeatherRequestDetail(position) {
  const locationOverride = getWeatherLocationOverride();
  if (locationOverride) {
    return `手動地區：${locationOverride}`;
  }

  if (position) {
    return "使用瀏覽器定位尋找最近測站";
  }

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

async function loadLocalWeather(forceRefresh = false) {
  try {
    setWeatherText("氣象定位中...", "準備更新最近測站與預報");
    const locationOverride = getWeatherLocationOverride();
    const position = locationOverride ? null : await getWeatherPosition(forceRefresh);
    setWeatherText(getWeatherLoadingLabel(position), getWeatherRequestDetail(position));
    const params = new URLSearchParams();

    if (forceRefresh) params.set("refresh", "1");
    if (locationOverride) {
      params.set("locationName", locationOverride);
      params.set("manual", "1");
    }
    if (position) {
      params.set("lat", position.lat.toFixed(5));
      params.set("lon", position.lon.toFixed(5));
    }

    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`/api/weather/local${query}`, {
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      if (data && data.configured === false) {
        setWeatherText(
          "部署環境未讀到氣象授權碼",
          getWeatherUnavailableMessage(data),
        );
        return;
      }

      throw new Error(data.error || "Load weather failed");
    }

    renderLocalWeather(data);
  } catch (err) {
    setWeatherText("氣象資料讀取失敗", err.message);
  }
}

async function trackView() {
  try {
    clearError();

    // fetch 是瀏覽器呼叫 API 的方法。
    // POST /track-view 會讓後端記錄一次頁面瀏覽。
    const res = await fetch("/track-view", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        visitorId: getVisitorId(),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Track view failed");
    }

    renderStats(data);
  } catch (err) {
    updateBadge("error");
    setError("瀏覽統計更新失敗：" + err.message);
  }
}

async function loadStats() {
  try {
    // GET /stats 只讀統計，不增加瀏覽次數。
    // setInterval 會每 30 秒呼叫一次，讓 Active Now 自動更新。
    const res = await fetch("/stats", {
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Load stats failed");
    }

    renderStats(data);
  } catch (err) {
    updateBadge("error");
    setError("無法讀取統計資料：" + err.message);
  }
}

async function heartbeatActiveVisitor() {
  try {
    // 這個 API 只維持「目前在線」，不增加累計/今日訪客。
    const res = await fetch("/heartbeat", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        visitorId: getVisitorId(),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Heartbeat failed");
    }

    renderActiveVisitors(data);
  } catch (err) {
    updateBadge("error");
  }
}

async function loadCount() {
  try {
    // GET /count 只取得目前 Current Count。
    const res = await fetch("/count", {
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Load count failed");
    }

    document.getElementById("count").textContent = data.count;
    updateBadge(data.redis);
  } catch (err) {
    document.getElementById("count").textContent = "ERR";
    updateBadge("error");
    setError("無法讀取目前計數：" + err.message);
  }
}

const INCIDENT_STORAGE_KEY = "noc_incident_state";
const INCIDENT_ACTIVE_RECORD_STORAGE_KEY = "noc_incident_active_record_id";
const HANDOVER_SUMMARY_REQUIRED_FIELDS = [
  { field: "title", label: "一句話主旨", elementId: "incidentTitle" },
  { field: "status", label: "目前狀態", elementId: "incidentStatus" },
  { field: "impact", label: "影響範圍", elementId: "incidentImpact" },
  { field: "nextStep", label: "下一步", elementId: "incidentNextStep" },
  { field: "notified", label: "已通知", elementId: "incidentNotified" },
];
const INCIDENT_PHRASE_GROUPS = {
  nextStep: {
    fieldId: "incidentNextStep",
    menuId: "nextStepPhraseMenu",
    phrases: [
      "已通知二線，等待回覆。",
      "持續監控，若再發生告警再升級處理。",
      "請客戶補充錯誤截圖 / 序號 / 聯絡資訊。",
      "待客戶或窗口回覆後再更新處理紀錄。",
      "已建立 Jira 小卡，後續於小卡追蹤。",
    ],
  },
  notes: {
    fieldId: "incidentNotes",
    menuId: "notesPhraseMenu",
    withTime: true,
    phrases: [
      "已確認告警時間與來源。",
      "已確認目前暫無服務影響。",
      "已通知相關窗口並等待回覆。",
      "已依 SOP 完成初步檢查。",
      "已回覆客戶目前處理狀態。",
    ],
  },
};
const SERVICE_TYPE_HINTS = {
  general: "一般諮詢只保留後續處理與其他補充，避免不必要的報修欄位干擾。",
  repair: "產品報修會顯示產品、合約、序號與對接窗口欄位。",
  aws: "AWS 邀請組織先保留產品與窗口資訊；帳號、組織或特殊需求可寫在其他補充。",
  other: "其他類型只保留窗口與補充欄位，需要的背景請寫在其他補充。",
  empty: "選擇服務類型後，下方只會顯示相關補充欄位。",
};
const PHONE_TEST_NUMBER = "+886800008669";
const PHONE_TEST_POST_CONNECT_KEY = "3";
let incidentRecordsCache = [];
let activeIncidentRecordId = "";
let incidentHistoryView = "open";

function getIncidentFields() {
  // 用 data-incident-field 找到事件表單欄位。
  // 這樣以後新增欄位時，不用每個地方都手動補 id。
  return Array.from(document.querySelectorAll("[data-incident-field]"));
}

function getIncidentChecks() {
  return Array.from(document.querySelectorAll("[data-incident-check]"));
}

function getIncidentRadios() {
  // radio 是單選題：同一組 name 只會有一個被選到。
  return Array.from(document.querySelectorAll("[data-incident-radio]"));
}

function getIncidentFollowups() {
  // 後續處理方式是複選題，所以每一個 checkbox 都要各自記錄。
  return Array.from(document.querySelectorAll("[data-incident-followup]"));
}

function getSelectedIncidentRadioValue(name) {
  const radio = document.querySelector(`[data-incident-radio="${name}"]:checked`);
  return radio ? radio.value : "";
}

function getServiceTypeDisplayMode(serviceType = getSelectedIncidentRadioValue("serviceType")) {
  if (serviceType === "產品報修" || serviceType === "協助客戶報修") return "repair";
  if (serviceType === "AWS - 邀請組織") return "aws";
  if (serviceType === "其他") return "other";
  if (serviceType === "一般諮詢") return "general";
  return "empty";
}

function updateServiceTypeFieldVisibility() {
  const mode = getServiceTypeDisplayMode();
  const sections = document.querySelectorAll(".field[data-service-section]");

  sections.forEach((section) => {
    const sectionModes = String(section.dataset.serviceSection || "").split(/\s+/);
    section.hidden = !(sectionModes.includes("base") || sectionModes.includes(mode));
  });

  const serviceTypeOther = document.getElementById("incidentServiceTypeOther");
  if (serviceTypeOther) {
    serviceTypeOther.hidden = mode !== "other";
  }

  const followupOther = document.getElementById("incidentFollowupOther");
  const otherFollowup = document.querySelector('[data-incident-followup="其他"]');
  if (followupOther && otherFollowup) {
    followupOther.hidden = !otherFollowup.checked;
  }

  const hint = document.getElementById("serviceTypeHint");
  if (hint) {
    hint.textContent = SERVICE_TYPE_HINTS[mode] || SERVICE_TYPE_HINTS.empty;
  }
}

function readIncidentStateFromPage() {
  const fields = {};
  const checks = {};
  const radios = {};
  const followups = {};

  getIncidentFields().forEach((field) => {
    fields[field.dataset.incidentField] = field.value;
  });

  getIncidentChecks().forEach((check) => {
    checks[check.dataset.incidentCheck] = check.checked;
  });

  getIncidentRadios().forEach((radio) => {
    if (radio.checked) {
      radios[radio.dataset.incidentRadio] = radio.value;
    }
  });

  getIncidentFollowups().forEach((followup) => {
    followups[followup.dataset.incidentFollowup] = followup.checked;
  });

  return { fields, checks, radios, followups };
}

function saveIncidentState() {
  // 值班事件是個人暫存資料，所以存在 localStorage。
  // 重新整理網頁後資料還在，但不會送到 server 或 Redis。
  try {
    localStorage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify(readIncidentStateFromPage()));
  } catch (err) {
    setError("事件暫存失敗：" + err.message);
  }
}

function updateSaveIncidentButtonLabel() {
  const button = document.getElementById("saveIncidentButton");
  if (!button || button.disabled) return;

  button.textContent = activeIncidentRecordId ? "更新事件" : "儲存事件";
}

function setActiveIncidentRecordId(id) {
  activeIncidentRecordId = String(id || "");

  try {
    if (activeIncidentRecordId) {
      localStorage.setItem(INCIDENT_ACTIVE_RECORD_STORAGE_KEY, activeIncidentRecordId);
    } else {
      localStorage.removeItem(INCIDENT_ACTIVE_RECORD_STORAGE_KEY);
    }
  } catch {
    // 無法寫入 localStorage 時仍允許本次編輯使用記憶體狀態。
  }

  updateSaveIncidentButtonLabel();
}

function loadActiveIncidentRecordId() {
  try {
    activeIncidentRecordId = localStorage.getItem(INCIDENT_ACTIVE_RECORD_STORAGE_KEY) || "";
  } catch {
    activeIncidentRecordId = "";
  }

  updateSaveIncidentButtonLabel();
}

function normalizeIncidentFieldValue(fieldName, value) {
  const maps = {
    severity: {
      Info: "Info / 資訊",
      "資訊": "Info / 資訊",
      Warning: "Warning / 警告",
      "提醒": "Warning / 警告",
      "警告": "Warning / 警告",
      Critical: "Critical / 重大",
      "重大": "Critical / 重大",
      "Service Impact": "Service Impact / 服務影響",
      "服務影響": "Service Impact / 服務影響",
    },
    status: {
      Triage: "Triage / 初步判斷",
      "初步判斷": "Triage / 初步判斷",
      Notified: "Notified / 已通知",
      "已通知": "Notified / 已通知",
      Monitoring: "Monitoring / 監控中",
      "監控中": "Monitoring / 監控中",
      Waiting: "Waiting / 等待回覆",
      "等待回覆": "Waiting / 等待回覆",
      Resolved: "Resolved / 已解決",
      "已解決": "Resolved / 已解決",
      Handover: "Handover / 待交班",
      "待交班": "Handover / 待交班",
    },
  };

  return maps[fieldName] && maps[fieldName][value] ? maps[fieldName][value] : value;
}

function loadIncidentState() {
  try {
    const raw = localStorage.getItem(INCIDENT_STORAGE_KEY);
    if (!raw) return;

    applyIncidentStateToPage(JSON.parse(raw));
    updateServiceTypeFieldVisibility();
  } catch (err) {
    setError("事件暫存讀取失敗：" + err.message);
  }
}

function applyIncidentStateToPage(state) {
  const savedFields = state && state.fields ? state.fields : {};

  getIncidentFields().forEach((field) => {
    const fieldName = field.dataset.incidentField;
    field.value = Object.prototype.hasOwnProperty.call(savedFields, fieldName)
      ? normalizeIncidentFieldValue(fieldName, savedFields[fieldName])
      : "";
  });

  getIncidentChecks().forEach((check) => {
    check.checked = Boolean(state && state.checks && state.checks[check.dataset.incidentCheck]);
  });

  getIncidentRadios().forEach((radio) => {
    radio.checked = Boolean(state && state.radios && state.radios[radio.dataset.incidentRadio] === radio.value);
  });

  getIncidentFollowups().forEach((followup) => {
    followup.checked = Boolean(state && state.followups && state.followups[followup.dataset.incidentFollowup]);
  });

  updateServiceTypeFieldVisibility();
}

function formatLocalDateTime(date) {
  // datetime-local input 需要 yyyy-MM-ddTHH:mm 格式。
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "T" + [pad(date.getHours()), pad(date.getMinutes())].join(":");
}

function formatLocalTimeMinute(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [pad(date.getHours()), pad(date.getMinutes())].join(":");
}

function formatDisplayDateTime(value) {
  return value ? value.replace("T", " ") : "-";
}

function setIncidentNow() {
  const startedAt = document.getElementById("incidentStartedAt");
  startedAt.value = formatLocalDateTime(new Date());
  saveIncidentState();
  updateHandoverSummary();
}

function buildHandoverSummary() {
  const state = readIncidentStateFromPage();
  const fields = state.fields;
  const radios = state.radios;
  const valueOrDash = (value) => {
    const normalized = typeof value === "string" ? value.trim() : value;
    return normalized || "-";
  };
  const hasValue = (value) => valueOrDash(value) !== "-";
  const line = (label, value) => `${label}：${valueOrDash(value)}`;
  const serviceType = radios.serviceType === "其他" && fields.serviceTypeOther
    ? `其他：${fields.serviceTypeOther}`
    : (radios.serviceType || "-");
  const followupLines = getIncidentFollowups()
    .filter((followup) => followup.checked)
    .map((followup) => {
      if (followup.dataset.incidentFollowup === "其他" && fields.followupOther) {
        return `其他：${fields.followupOther}`;
      }

      return followup.dataset.incidentFollowup;
    });
  const followupText = followupLines.length ? followupLines.join("、") : "-";
  const doneChecks = getIncidentChecks()
    .filter((check) => check.checked)
    .map((check) => check.dataset.incidentCheck);
  const serviceMode = getServiceTypeDisplayMode(radios.serviceType);
  const supplementByServiceMode = {
    repair: [
      ["產品名稱", fields.productName],
      ["合約編號", fields.contractId],
      ["產品型號", fields.model],
      ["產品序號", fields.serial],
      ["經銷商名稱", fields.dealer],
      ["報修對象", fields.repairTarget],
      ["負責業務 / 工程師", fields.owner],
      ["聯繫方式 / 稱呼", fields.contactMethod],
      ["是否為客戶", radios.isCustomer],
    ],
    aws: [
      ["產品名稱", fields.productName],
      ["負責業務 / 工程師", fields.owner],
      ["聯繫方式 / 稱呼", fields.contactMethod],
      ["是否為客戶", radios.isCustomer],
    ],
    other: [
      ["負責業務 / 工程師", fields.owner],
      ["聯繫方式 / 稱呼", fields.contactMethod],
      ["是否為客戶", radios.isCustomer],
    ],
    general: [],
    empty: [],
  };
  const reportLines = [
    ...(supplementByServiceMode[serviceMode] || []),
    ["後續處理方式", followupText],
    ["其他補充", fields.extraInfo],
  ]
    .filter(([, value]) => hasValue(value))
    .map(([label, value]) => line(label, value));

  return [
    "【接手重點】",
    `[${valueOrDash(fields.severity)} / ${valueOrDash(fields.status)}] ${valueOrDash(fields.title)}`,
    line("事件時間", formatDisplayDateTime(fields.startedAt)),
    line("客戶 / 單位", fields.customer),
    line("系統 / 設備", fields.system),
    line("來源", fields.source),
    line("服務類型", serviceType),
    "",
    "【問題 / 影響】",
    line("問題描述", fields.problemDescription),
    line("影響範圍", fields.impact),
    "",
    "【接手動作】",
    line("下一步", fields.nextStep),
    line("下次確認", formatDisplayDateTime(fields.nextCheckAt)),
    line("接手人員", fields.handoverOwner),
    line("已通知", fields.notified),
    "",
    "【處理紀錄】",
    valueOrDash(fields.notes),
    "",
    "【已完成檢查】",
    doneChecks.length ? doneChecks.join("、") : "-",
    "",
    "【報修補充】",
    reportLines.length ? reportLines.join("\n") : "-",
  ].join("\n");
}

function updateHandoverSummary() {
  const output = document.getElementById("handoverSummary");
  if (output) {
    output.value = buildHandoverSummary();
  }
}

function closeIncidentPhraseMenus() {
  Object.values(INCIDENT_PHRASE_GROUPS).forEach((group) => {
    const menu = document.getElementById(group.menuId);
    const trigger = document.querySelector(`[aria-controls="${group.menuId}"]`);

    if (menu) menu.hidden = true;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  });
}

function toggleIncidentPhraseMenu(groupName) {
  const group = INCIDENT_PHRASE_GROUPS[groupName];
  if (!group) return;

  const menu = document.getElementById(group.menuId);
  const trigger = document.querySelector(`[aria-controls="${group.menuId}"]`);
  if (!menu) return;

  const shouldOpen = menu.hidden;
  closeIncidentPhraseMenus();
  menu.hidden = !shouldOpen;
  if (trigger) trigger.setAttribute("aria-expanded", String(shouldOpen));
}

function insertTextAtFieldEnd(field, text) {
  const currentValue = field.value;
  const prefix = currentValue && !currentValue.endsWith("\n") ? "\n" : "";
  field.value = `${currentValue}${prefix}${text}`;
  field.focus();
  field.selectionStart = field.value.length;
  field.selectionEnd = field.value.length;
}

function insertIncidentPhrase(groupName, phrase) {
  const group = INCIDENT_PHRASE_GROUPS[groupName];
  const field = group && document.getElementById(group.fieldId);
  if (!group || !field) return;

  const text = group.withTime ? `${formatLocalTimeMinute()} ${phrase}` : phrase;
  insertTextAtFieldEnd(field, text);
  saveIncidentState();
  setHandoverSummaryStatus("");
  updateHandoverSummary();
  closeIncidentPhraseMenus();
}

function initIncidentPhraseMenus() {
  Object.entries(INCIDENT_PHRASE_GROUPS).forEach(([groupName, group]) => {
    const menu = document.getElementById(group.menuId);
    if (!menu) return;

    const buttons = group.phrases.map((phrase) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "phrase-menu-item";
      button.textContent = phrase;
      button.addEventListener("click", () => insertIncidentPhrase(groupName, phrase));
      return button;
    });

    menu.replaceChildren(...buttons);
  });
}

function getMissingHandoverSummaryFields(state = readIncidentStateFromPage()) {
  const fields = state.fields || {};
  return HANDOVER_SUMMARY_REQUIRED_FIELDS.filter((item) => !String(fields[item.field] || "").trim());
}

function focusHandoverSummaryField(item) {
  const field = item && document.getElementById(item.elementId);
  if (!field) return;

  field.focus();
  field.scrollIntoView({ block: "center", behavior: "smooth" });
}

async function copyHandoverSummary() {
  try {
    const state = readIncidentStateFromPage();
    const missingFields = getMissingHandoverSummaryFields(state);

    if (missingFields.length) {
      setHandoverSummaryStatus(`交班摘要還缺：${missingFields.map((item) => item.label).join("、")}。`, "error");
      focusHandoverSummaryField(missingFields[0]);
      return;
    }

    updateHandoverSummary();
    const summary = document.getElementById("handoverSummary").value;
    await navigator.clipboard.writeText(summary);

    markIncidentCheck("整理交班資訊");
    saveIncidentState();
    updateHandoverSummary();
    setHandoverSummaryStatus("已複製交班摘要。", "success");
  } catch (err) {
    setHandoverSummaryStatus("交班摘要複製失敗：" + err.message, "error");
  }
}

function setPhoneCallStatus(message, dialUrl) {
  const status = document.getElementById("phoneCallStatus");
  if (!status) return;

  if (!message) {
    status.replaceChildren();
    return;
  }

  const messageNode = document.createElement("span");
  messageNode.textContent = message;

  if (!dialUrl) {
    status.replaceChildren(messageNode);
    return;
  }

  const dialLink = document.createElement("a");
  dialLink.href = dialUrl;
  dialLink.textContent = "再次撥號";
  status.replaceChildren(messageNode, dialLink);
}

function startPhoneTestCall() {
  const phone = PHONE_TEST_NUMBER.replace(/\s+/g, "");
  const dialUrl = `tel:${phone}`;

  setPhoneCallStatus(
    `撥號中：${phone}，接通後按 ${PHONE_TEST_POST_CONNECT_KEY}。`,
    dialUrl,
  );

  window.location.href = dialUrl;
}

function setJiraStatus(message, type, linkUrl) {
  const status = document.getElementById("jiraStatus");
  if (!status) return;

  status.className = type ? `jira-status ${type}` : "jira-status";

  if (!message) {
    status.replaceChildren();
    return;
  }

  const messageNode = document.createElement("span");
  messageNode.textContent = message;

  if (!linkUrl) {
    status.replaceChildren(messageNode);
    return;
  }

  const link = document.createElement("a");
  link.href = linkUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "開啟 Jira";
  status.replaceChildren(messageNode, link);
}

function setIncidentHistoryStatus(message, type) {
  const status = document.getElementById("incidentHistoryStatus");
  if (!status) return;

  status.className = type ? `incident-history-status ${type}` : "incident-history-status";
  status.textContent = message || "";
}

function setHandoverSummaryStatus(message, type) {
  const status = document.getElementById("handoverSummaryStatus");
  if (!status) return;

  status.className = type ? `handover-summary-status ${type}` : "handover-summary-status";
  status.textContent = message || "";
}

function setCreateJiraButtonLoading(isLoading) {
  const button = document.getElementById("createJiraIssueButton");
  if (!button) return;

  button.disabled = isLoading;
  button.textContent = isLoading ? "建立中..." : "建立 Jira 小卡";
}

function setSaveIncidentButtonLoading(isLoading) {
  const button = document.getElementById("saveIncidentButton");
  if (!button) return;

  button.disabled = isLoading;
  button.textContent = isLoading
    ? (activeIncidentRecordId ? "更新中..." : "儲存中...")
    : (activeIncidentRecordId ? "更新事件" : "儲存事件");
}

function markIncidentCheck(label) {
  const check = getIncidentChecks().find((item) => item.dataset.incidentCheck === label);
  if (check) {
    check.checked = true;
  }
}

function formatJiraCreateError(data) {
  if (data && Array.isArray(data.missing) && data.missing.length) {
    return `Jira 尚未設定：${data.missing.join("、")}`;
  }

  const details = data && data.details;
  const messages = [];

  if (details && Array.isArray(details.errorMessages)) {
    messages.push(...details.errorMessages);
  }

  if (details && details.errors) {
    messages.push(...Object.values(details.errors));
  }

  return messages.length ? messages.join("；") : (data && data.error) || "建立 Jira 小卡失敗";
}

function hasIncidentContent(state) {
  return Object.values(state.fields || {}).some((value) => String(value || "").trim())
    || Object.values(state.checks || {}).some(Boolean)
    || Object.values(state.radios || {}).some(Boolean)
    || Object.values(state.followups || {}).some(Boolean);
}

async function createJiraIssue() {
  const state = readIncidentStateFromPage();

  if (!hasIncidentContent(state)) {
    setJiraStatus("先填寫事件內容，再建立 Jira 小卡。", "error");
    return;
  }

  try {
    clearError();
    setJiraStatus("正在建立 Jira 小卡...", "pending");
    setCreateJiraButtonLoading(true);
    updateHandoverSummary();

    const res = await fetch("/api/jira/issues", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        incident: state,
        handoverSummary: document.getElementById("handoverSummary").value,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(formatJiraCreateError(data));
    }

    markIncidentCheck("補上 Jira / 小卡處理紀錄");
    saveIncidentState();
    updateHandoverSummary();
    setJiraStatus(`已建立 Jira 小卡：${data.key}`, "success", data.url);
  } catch (err) {
    setJiraStatus("建立 Jira 小卡失敗：" + err.message, "error");
  } finally {
    setCreateJiraButtonLoading(false);
  }
}

function formatIncidentRecordTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace("T", " ").slice(0, 16);

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatIncidentRecordSavedTime(record) {
  const value = record && (record.updatedAt || record.createdAt);
  const formatted = formatIncidentRecordTime(value);
  return formatted === "-" ? "" : `更新 ${formatted}`;
}

function getIncidentRecordFields(record) {
  return record && record.incident && record.incident.fields ? record.incident.fields : {};
}

function getIncidentRecordNextCheckValue(record) {
  return String(getIncidentRecordFields(record).nextCheckAt || "").trim();
}

function parseIncidentDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isIncidentRecordResolved(record) {
  const status = String(record && record.status ? record.status : "").toLowerCase();
  return Boolean(record && (record.resolvedAt || status.includes("resolved") || status.includes("已解決")));
}

function isIncidentRecordDue(record) {
  const nextCheckAt = parseIncidentDateTime(getIncidentRecordNextCheckValue(record));
  return Boolean(nextCheckAt && !isIncidentRecordResolved(record) && nextCheckAt.getTime() <= Date.now());
}

function getIncidentRecordNextCheckLabel(record) {
  const nextCheckValue = getIncidentRecordNextCheckValue(record);
  if (!nextCheckValue) return "";

  const label = isIncidentRecordDue(record) ? "待確認" : "下次確認";
  return `${label} ${formatIncidentRecordTime(nextCheckValue)}`;
}

function getIncidentRecordSortTime(record) {
  const date = parseIncidentDateTime(record && (record.updatedAt || record.createdAt));
  return date ? date.getTime() : 0;
}

function compareIncidentRecordsForDisplay(a, b) {
  const aResolved = isIncidentRecordResolved(a);
  const bResolved = isIncidentRecordResolved(b);
  if (aResolved !== bResolved) return aResolved ? 1 : -1;

  const aDue = isIncidentRecordDue(a);
  const bDue = isIncidentRecordDue(b);
  if (aDue !== bDue) return aDue ? -1 : 1;

  const aNextCheck = parseIncidentDateTime(getIncidentRecordNextCheckValue(a));
  const bNextCheck = parseIncidentDateTime(getIncidentRecordNextCheckValue(b));
  if (aNextCheck && bNextCheck) return aNextCheck.getTime() - bNextCheck.getTime();
  if (aNextCheck || bNextCheck) return aNextCheck ? -1 : 1;

  return getIncidentRecordSortTime(b) - getIncidentRecordSortTime(a);
}

function getIncidentRecordMeta(record) {
  return [
    record.severity,
    record.status,
    record.customer,
    record.system,
    record.source,
  ].filter(Boolean).join(" / ") || "未分類事件";
}

function restoreIncidentRecord(record) {
  if (!record || !record.incident) return;

  applyIncidentStateToPage(record.incident);
  setActiveIncidentRecordId(record.id);
  saveIncidentState();
  updateHandoverSummary();
  setHandoverSummaryStatus("");
  setIncidentHistoryStatus(`已載入事件：${record.title || record.id}。後續儲存會更新這筆紀錄。`, "success");
  setActiveView("dashboard");
  const title = document.getElementById("incidentTitle");
  if (title) title.focus();
}

async function copyIncidentRecordSummary(record) {
  try {
    await navigator.clipboard.writeText(record.handoverSummary || "");
    setIncidentHistoryStatus("已複製這筆事件的交班摘要。", "success");
  } catch (err) {
    setIncidentHistoryStatus("複製事件摘要失敗：" + err.message, "error");
  }
}

async function resolveIncidentRecord(record) {
  if (!record || !record.id) return;
  if (!confirm(`確定要將「${record.title || "未命名事件"}」標記為已解決？`)) return;

  try {
    setIncidentHistoryStatus("正在標記已解決...", "pending");
    const res = await fetch(`/api/incidents/${encodeURIComponent(record.id)}/resolve`, {
      method: "PATCH",
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Resolve incident failed");
    }

    if (activeIncidentRecordId === record.id && data.incident && data.incident.incident) {
      applyIncidentStateToPage(data.incident.incident);
      saveIncidentState();
      updateHandoverSummary();
    }

    setIncidentHistoryStatus(`已結案：${data.incident.title}`, "success");
    await loadIncidentRecords({ showLoading: false });
  } catch (err) {
    setIncidentHistoryStatus("標記已解決失敗：" + err.message, "error");
  }
}

async function deleteIncidentRecord(record) {
  if (!record || !record.id) return;
  if (!confirm(`確定要刪除「${record.title || "未命名事件"}」？`)) return;

  try {
    setIncidentHistoryStatus("正在刪除事件紀錄...", "pending");
    const res = await fetch(`/api/incidents/${encodeURIComponent(record.id)}`, {
      method: "DELETE",
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Delete incident failed");
    }

    if (activeIncidentRecordId === record.id) {
      setActiveIncidentRecordId("");
    }

    setIncidentHistoryStatus("已刪除事件紀錄。", "success");
    await loadIncidentRecords({ showLoading: false });
  } catch (err) {
    setIncidentHistoryStatus("刪除事件紀錄失敗：" + err.message, "error");
  }
}

function createIncidentRecordCard(record) {
  const card = document.createElement("article");
  card.className = "incident-record";
  card.classList.toggle("resolved", isIncidentRecordResolved(record));
  card.classList.toggle("due", isIncidentRecordDue(record));

  const restoreButton = document.createElement("button");
  restoreButton.type = "button";
  restoreButton.className = "incident-record-action primary";
  restoreButton.textContent = "載入";
  restoreButton.addEventListener("click", () => restoreIncidentRecord(record));

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "incident-record-action";
  copyButton.textContent = "複製";
  copyButton.addEventListener("click", () => copyIncidentRecordSummary(record));

  const resolveButton = document.createElement("button");
  resolveButton.type = "button";
  resolveButton.className = "incident-record-action";
  resolveButton.textContent = "結案";
  resolveButton.addEventListener("click", () => resolveIncidentRecord(record));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "incident-record-action danger";
  deleteButton.textContent = "刪除";
  deleteButton.addEventListener("click", () => deleteIncidentRecord(record));

  const body = document.createElement("div");
  body.className = "incident-record-body";

  const top = document.createElement("div");
  top.className = "incident-record-top";

  const side = document.createElement("div");
  side.className = "incident-record-side";

  const topActions = document.createElement("div");
  topActions.className = "incident-record-actions";
  topActions.appendChild(restoreButton);
  topActions.appendChild(copyButton);
  if (!isIncidentRecordResolved(record)) {
    topActions.appendChild(resolveButton);
  }
  topActions.appendChild(deleteButton);

  const savedTime = formatIncidentRecordSavedTime(record);
  const nextCheckLabel = getIncidentRecordNextCheckLabel(record);
  if (nextCheckLabel) {
    const reminder = createTextElement(
      "time",
      isIncidentRecordDue(record) ? "incident-record-reminder due" : "incident-record-reminder",
      nextCheckLabel,
    );
    reminder.dateTime = getIncidentRecordNextCheckValue(record);
    side.appendChild(reminder);
  }
  if (savedTime) {
    const time = createTextElement("time", "incident-record-time", savedTime);
    time.dateTime = record.updatedAt || record.createdAt;
    side.appendChild(time);
  }
  side.appendChild(topActions);

  const titleBlock = document.createElement("div");
  titleBlock.className = "incident-record-title-block";
  titleBlock.appendChild(createTextElement("h4", "incident-record-title", record.title || "未命名事件"));
  titleBlock.appendChild(createTextElement("div", "incident-record-meta", getIncidentRecordMeta(record)));

  if (isIncidentRecordResolved(record)) {
    titleBlock.appendChild(createTextElement("div", "incident-record-state", "已解決"));
  }

  if (record.summary) {
    titleBlock.appendChild(createTextElement("p", "incident-record-summary", record.summary));
  }

  top.appendChild(titleBlock);
  top.appendChild(side);
  body.appendChild(top);
  card.appendChild(body);

  return card;
}

function renderIncidentRecords(records) {
  const list = document.getElementById("incidentHistoryList");
  if (!list) return;

  incidentRecordsCache = Array.isArray(records) ? records : [];

  if (!records || records.length === 0) {
    const emptyText = incidentHistoryView === "all"
      ? "目前還沒有儲存的事件紀錄"
      : "目前沒有未結案事件紀錄";
    list.replaceChildren(createTextElement("div", "incident-history-empty", emptyText));
    return;
  }

  const sortedRecords = [...records].sort(compareIncidentRecordsForDisplay);
  list.replaceChildren(...sortedRecords.map(createIncidentRecordCard));
}

function refreshIncidentRecordReminderState() {
  if (incidentRecordsCache.length) {
    renderIncidentRecords(incidentRecordsCache);
  }
}

function updateIncidentHistoryViewButtons() {
  const openButton = document.getElementById("incidentOpenFilterButton");
  const allButton = document.getElementById("incidentAllFilterButton");

  if (openButton) {
    openButton.classList.toggle("active", incidentHistoryView === "open");
    openButton.setAttribute("aria-pressed", String(incidentHistoryView === "open"));
  }

  if (allButton) {
    allButton.classList.toggle("active", incidentHistoryView === "all");
    allButton.setAttribute("aria-pressed", String(incidentHistoryView === "all"));
  }
}

function setIncidentHistoryView(view) {
  incidentHistoryView = view === "all" ? "all" : "open";
  updateIncidentHistoryViewButtons();
  loadIncidentRecords();
}

async function loadIncidentRecords(options = {}) {
  const list = document.getElementById("incidentHistoryList");
  const showLoading = options.showLoading !== false;

  try {
    updateIncidentHistoryViewButtons();

    if (list && showLoading) {
      list.replaceChildren(createTextElement("div", "incident-history-empty", "事件紀錄載入中..."));
    }

    const params = new URLSearchParams({
      limit: "20",
      view: incidentHistoryView,
    });
    const res = await fetch(`/api/incidents?${params.toString()}`, {
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Load incidents failed");
    }

    incidentRecordsCache = data.incidents || [];
    renderIncidentRecords(incidentRecordsCache);
    return incidentRecordsCache;
  } catch (err) {
    if (list && showLoading) {
      list.replaceChildren(createTextElement("div", "incident-history-empty", "事件紀錄讀取失敗：" + err.message));
    }
    if (showLoading) {
      setIncidentHistoryStatus("事件紀錄讀取失敗：" + err.message, "error");
    }
    return incidentRecordsCache;
  }
}

async function saveIncidentRecord() {
  const state = readIncidentStateFromPage();

  if (!hasIncidentContent(state)) {
    setIncidentHistoryStatus("先填寫事件內容，再儲存紀錄。", "error");
    return;
  }

  try {
    clearError();
    setIncidentHistoryStatus(activeIncidentRecordId ? "正在更新事件紀錄..." : "正在儲存事件紀錄...", "pending");
    setSaveIncidentButtonLoading(true);
    updateHandoverSummary();

    const recordId = activeIncidentRecordId;
    const res = await fetch(recordId ? `/api/incidents/${encodeURIComponent(recordId)}` : "/api/incidents", {
      method: recordId ? "PUT" : "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        incident: state,
        handoverSummary: document.getElementById("handoverSummary").value,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Save incident failed");
    }

    setActiveIncidentRecordId(data.incident.id);
    setIncidentHistoryStatus(`${recordId ? "已更新事件" : "已儲存事件"}：${data.incident.title}`, "success");
    await loadIncidentRecords({ showLoading: false });
  } catch (err) {
    if (activeIncidentRecordId && err.message === "incident not found") {
      setActiveIncidentRecordId("");
    }
    setIncidentHistoryStatus("儲存事件失敗：" + err.message, "error");
  } finally {
    setSaveIncidentButtonLoading(false);
  }
}

function clearIncidentState() {
  if (!confirm("確定要清空目前事件紀錄嗎？")) {
    return;
  }

  getIncidentFields().forEach((field) => {
    field.value = "";
  });

  getIncidentChecks().forEach((check) => {
    check.checked = false;
  });

  getIncidentRadios().forEach((radio) => {
    radio.checked = false;
  });

  getIncidentFollowups().forEach((followup) => {
    followup.checked = false;
  });

  updateServiceTypeFieldVisibility();
  localStorage.removeItem(INCIDENT_STORAGE_KEY);
  setActiveIncidentRecordId("");
  setJiraStatus("");
  setHandoverSummaryStatus("");
  setIncidentHistoryStatus("");
  updateHandoverSummary();
}

function initIncidentPanel() {
  initIncidentPhraseMenus();
  loadIncidentState();
  updateServiceTypeFieldVisibility();
  loadActiveIncidentRecordId();
  if (!hasIncidentContent(readIncidentStateFromPage())) {
    setActiveIncidentRecordId("");
  }
  updateHandoverSummary();
  const syncIncidentState = () => {
    saveIncidentState();
    setHandoverSummaryStatus("");
    updateServiceTypeFieldVisibility();
    updateHandoverSummary();
  };

  getIncidentFields().forEach((field) => {
    field.addEventListener("input", syncIncidentState);
    field.addEventListener("change", syncIncidentState);
  });

  getIncidentChecks().forEach((check) => {
    check.addEventListener("change", syncIncidentState);
  });

  getIncidentRadios().forEach((radio) => {
    radio.addEventListener("change", syncIncidentState);
  });

  getIncidentFollowups().forEach((followup) => {
    followup.addEventListener("change", syncIncidentState);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".has-phrase-menu")) {
      closeIncidentPhraseMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeIncidentPhraseMenus();
    }
  });
}

const RUNBOOK_STATE = {
  categories: [],
  runbooks: [],
  activeCategory: "all",
  keyword: "",
};

function createTextElement(tagName, className, text) {
  // 建立 HTML 元素時使用 textContent，不用 innerHTML。
  // 這樣即使後端資料有特殊字元，也不會被瀏覽器當成程式碼執行。
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text || "";
  return element;
}

function getRunbookCategoryName(categoryId) {
  const category = RUNBOOK_STATE.categories.find((item) => item.id === categoryId);
  return category ? category.name : categoryId;
}

function getFilteredRunbooks() {
  const keyword = RUNBOOK_STATE.keyword.trim().toLowerCase();

  return RUNBOOK_STATE.runbooks.filter((runbook) => {
    const categoryMatched = RUNBOOK_STATE.activeCategory === "all"
      || runbook.category === RUNBOOK_STATE.activeCategory;

    if (!categoryMatched) return false;
    if (!keyword) return true;

    const searchableText = [
      runbook.title,
      runbook.summary,
      runbook.severity,
      ...(runbook.triggers || []),
      ...(runbook.dutyRules || []),
      ...(runbook.replyRules || []),
      ...(runbook.ignoreRules || []),
      ...(runbook.firstChecks || []),
      ...(runbook.steps || []),
      ...(runbook.escalateWhen || []),
      ...(runbook.contacts || []),
      ...(runbook.mailRecipients || []),
      ...((runbook.extraSections || []).flatMap((section) => [
        section.title,
        ...(section.items || []),
      ])),
    ].join(" ").toLowerCase();

    return searchableText.includes(keyword);
  });
}

function renderRunbookCategories() {
  const container = document.getElementById("runbookCategories");
  if (!container) return;

  const allButton = createRunbookCategoryButton("all", "全部");
  const buttons = RUNBOOK_STATE.categories.map((category) => (
    createRunbookCategoryButton(category.id, category.name)
  ));

  container.replaceChildren(allButton, ...buttons);
}

function createRunbookCategoryButton(categoryId, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = categoryId === RUNBOOK_STATE.activeCategory
    ? "runbook-category active"
    : "runbook-category";
  button.textContent = label;

  button.addEventListener("click", () => {
    RUNBOOK_STATE.activeCategory = categoryId;
    renderRunbookCategories();
    renderRunbooks();
  });

  return button;
}

function appendRunbookList(parent, title, items) {
  if (!items || items.length === 0) return;

  const section = document.createElement("div");
  section.className = "runbook-detail";
  section.appendChild(createTextElement("h4", "", title));

  const list = document.createElement("ul");
  items.forEach((item) => {
    list.appendChild(createTextElement("li", "", item));
  });

  section.appendChild(list);
  parent.appendChild(section);
}

function appendRunbookExtraSections(parent, sections) {
  // 不同產品的 SOP 會有自己的特殊段落。
  // extraSections 讓資料可以自由新增「案件追蹤」「Case 範本」「Q&A」等內容。
  (sections || []).forEach((section) => {
    appendRunbookList(parent, section.title, section.items);
  });
}

function fillIncidentNextStepFromRunbook(runbook) {
  // 讓 SOP 不只可以看，也可以快速帶進事件表單的「下一步」。
  const nextStep = document.getElementById("incidentNextStep");
  if (!nextStep) return;

  nextStep.value = [
    `[Runbook] ${runbook.title}`,
    ...(runbook.steps || []).map((step, idx) => `${idx + 1}. ${step}`),
  ].join("\n");

  markIncidentCheck("查閱對應 SOP");
  saveIncidentState();
  updateHandoverSummary();
  setActiveView("dashboard");
  nextStep.focus();
  nextStep.scrollIntoView({ behavior: "smooth", block: "center" });
}

function createRunbookCard(runbook) {
  const card = document.createElement("article");
  card.className = "runbook-card";

  const header = document.createElement("div");
  header.className = "runbook-card-header";

  const titleBlock = document.createElement("div");
  titleBlock.appendChild(createTextElement("h3", "runbook-card-title", runbook.title));
  titleBlock.appendChild(createTextElement("p", "runbook-card-summary", runbook.summary));

  const tag = createTextElement("span", "runbook-tag", getRunbookCategoryName(runbook.category));
  header.appendChild(titleBlock);
  header.appendChild(tag);

  const meta = createTextElement("div", "runbook-card-meta", `嚴重度：${runbook.severity || "未分類"}`);

  const body = document.createElement("div");
  body.className = "runbook-card-body";
  appendRunbookList(body, "值班規則", runbook.dutyRules);
  appendRunbookList(body, "信件判斷", runbook.replyRules);
  appendRunbookList(body, "不需處理", runbook.ignoreRules);
  appendRunbookList(body, "觸發情境", runbook.triggers);
  appendRunbookList(body, "先確認", runbook.firstChecks);
  appendRunbookList(body, "處理步驟", runbook.steps);
  appendRunbookList(body, "升級條件", runbook.escalateWhen);
  appendRunbookList(body, "聯絡資訊", runbook.contacts);
  appendRunbookList(body, "信件收件人", runbook.mailRecipients);
  appendRunbookExtraSections(body, runbook.extraSections);

  const actions = document.createElement("div");
  actions.className = "runbook-actions";

  (runbook.links || []).forEach((link) => {
    const anchor = document.createElement("a");
    anchor.className = "runbook-link";
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label;
    actions.appendChild(anchor);
  });

  const fillButton = document.createElement("button");
  fillButton.type = "button";
  fillButton.className = "runbook-fill";
  fillButton.textContent = "帶入下一步";
  fillButton.addEventListener("click", () => fillIncidentNextStepFromRunbook(runbook));
  actions.appendChild(fillButton);

  card.appendChild(header);
  card.appendChild(meta);
  card.appendChild(body);
  card.appendChild(actions);

  return card;
}

function renderRunbooks() {
  const list = document.getElementById("runbookList");
  if (!list) return;

  const filteredRunbooks = getFilteredRunbooks();

  if (filteredRunbooks.length === 0) {
    list.replaceChildren(createTextElement("div", "runbook-empty", "找不到符合條件的 Runbook"));
    return;
  }

  list.replaceChildren(...filteredRunbooks.map(createRunbookCard));
}

async function loadRunbooks() {
  const meta = document.getElementById("runbookMeta");
  const list = document.getElementById("runbookList");

  try {
    const res = await fetch("/api/runbooks", {
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Load runbooks failed");
    }

    RUNBOOK_STATE.categories = data.categories || [];
    RUNBOOK_STATE.runbooks = data.runbooks || [];

    if (meta) {
      meta.textContent = `v${data.version} / ${RUNBOOK_STATE.runbooks.length} items`;
    }

    renderRunbookCategories();
    renderRunbooks();
  } catch (err) {
    if (meta) meta.textContent = "Unavailable";
    if (list) {
      list.replaceChildren(createTextElement("div", "runbook-empty", "Runbook 載入失敗：" + err.message));
    }
  }
}

function initRunbookPanel() {
  const search = document.getElementById("runbookSearch");

  if (search) {
    search.addEventListener("input", () => {
      RUNBOOK_STATE.keyword = search.value;
      renderRunbooks();
    });
  }

  loadRunbooks();
}

function openLinkElements(selector) {
  const links = Array.from(document.querySelectorAll(selector))
    .map((link) => link.href)
    .filter(Boolean);

  if (!links.length) {
    alert("沒有可開啟的連結");
    return;
  }

  links.forEach((url, idx) => {
    setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), idx * 120);
  });
}

function openLinkGroup(groupId) {
  openLinkElements(`#${groupId} a.quick-link`);
}

function openCoreLinks() {
  openLinkGroup("coreLinksGrid");
}

function setLinksPanelOpen(isOpen) {
  const panel = document.getElementById("linksPanel");
  const toggle = document.getElementById("linksPanelToggle");
  if (!panel) return;

  panel.classList.toggle("open", isOpen);

  if (!isOpen) {
    panel.querySelectorAll("details[open]").forEach((details) => {
      details.open = false;
    });
  }

  if (toggle) {
    toggle.setAttribute("aria-expanded", String(isOpen));
  }
}

function toggleLinksPanel(forceOpen) {
  const panel = document.getElementById("linksPanel");
  if (!panel) return;

  const isOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : !panel.classList.contains("open");
  setLinksPanelOpen(isOpen);
}

function initLinksPanel() {
  document.addEventListener("click", (event) => {
    const panel = document.getElementById("linksPanel");
    if (!panel || !panel.classList.contains("open")) return;

    if (!event.target.closest("#linksPanel")) {
      setLinksPanelOpen(false);
      return;
    }

    const openDrawer = panel.querySelector(".link-drawer[open]");
    if (openDrawer && !event.target.closest(".link-drawer")) {
      openDrawer.open = false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setLinksPanelOpen(false);
    }
  });
}

function updateBackToTopButton() {
  const button = document.getElementById("backToTopButton");
  if (!button) return;

  button.classList.toggle("visible", window.scrollY > 420);
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

function initBackToTop() {
  updateBackToTopButton();
  window.addEventListener("scroll", updateBackToTopButton, { passive: true });
}

async function increment() {
  try {
    clearError();

    // POST /increment 會讓 Redis 裡的 counter +1。
    const res = await fetch("/increment", {
      method: "POST",
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Increment failed");
    }

    document.getElementById("count").textContent = data.count;
  } catch (err) {
    setError("+1 失敗：" + err.message);
  }
}

async function resetCounter() {
  try {
    clearError();
    const resetToken = getResetToken();

    if (!resetToken) {
      throw new Error("未輸入 Reset Token");
    }

    // Reset token 放在 header，不放在網址，也不寫死在 HTML。
    const res = await fetch("/reset", {
      method: "POST",
      cache: "no-store",
      headers: {
        "x-reset-token": resetToken,
      },
    });

    const data = await res.json();

    // HTTP 狀態不是 2xx 時，res.ok 會是 false。
    // throw 會跳到下面 catch，顯示錯誤。
    if (!res.ok) {
      // token 錯誤時清掉 sessionStorage，下一次按 Reset 會重新要求輸入。
      if (res.status === 403) {
        sessionStorage.removeItem("reset_token");
      }

      throw new Error(data.error || "Reset failed");
    }

    document.getElementById("count").textContent = data.count;
  } catch (err) {
    setError("Reset 失敗：" + err.message);
  }
}

// 頁面第一次載入時：
// 1. trackView() 記錄一次瀏覽並更新訪客統計
// 2. loadCount() 載入 Current Count
// 3. 每 30 秒 loadStats() 更新統計
initIncidentPanel();
initRunbookPanel();
initLinksPanel();
initBackToTop();
initTheme();
initViewTabs();
loadIncidentRecords();
loadLocalWeather();
trackView();
loadCount();
setInterval(loadStats, 30000);
setInterval(heartbeatActiveVisitor, 15000);
setInterval(loadLocalWeather, 3 * 60 * 1000);
setInterval(refreshIncidentRecordReminderState, 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    heartbeatActiveVisitor();
    loadStats();
    refreshIncidentRecordReminderState();
  }
});
