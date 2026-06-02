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
  { field: "trackingStatus", label: "追蹤狀態", elementId: "incidentTrackingStatus" },
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
const INCIDENT_TEMPLATES = [
  {
    id: "disk",
    label: "磁碟告警",
    fields: {
      title: "磁碟空間告警待確認",
      severity: "Warning / 警告",
      status: "Monitoring / 監控中",
      source: "Email",
      problemDescription: "監控告警顯示磁碟使用率達門檻，需確認成長原因、剩餘空間與是否需要清理或擴充。",
      impact: "目前先確認是否影響服務；若未見異常，持續觀察告警狀態。",
      nextStep: "確認磁碟使用率、主要佔用目錄與近期成長；必要時通知二線或窗口協助清理 / 擴充。",
      trackingStatus: "持續監控",
      notified: "待通知相關窗口。",
    },
  },
  {
    id: "resource",
    label: "CPU / 記憶體",
    fields: {
      title: "CPU / Memory 使用率告警待確認",
      severity: "Warning / 警告",
      status: "Monitoring / 監控中",
      source: "Email",
      problemDescription: "監控告警顯示 CPU 或 Memory 使用率達門檻，需確認是否為短暫尖峰、排程作業或服務異常。",
      impact: "目前先確認是否有延遲、服務不可用或資源不足跡象。",
      nextStep: "確認資源使用趨勢、主要程序與最近異動；若持續偏高再通知二線或系統窗口協助處理。",
      trackingStatus: "持續監控",
      notified: "待通知相關窗口。",
    },
  },
  {
    id: "website",
    label: "網站異常",
    fields: {
      title: "網站或服務異常待確認",
      severity: "Service Impact / 服務影響",
      status: "Triage / 初步判斷",
      source: "Customer",
      problemDescription: "收到網站或服務異常通報，需確認錯誤現象、發生時間、受影響範圍與最近變更。",
      impact: "可能影響使用者連線或服務可用性，需先確認是單一使用者、特定區域或整體服務。",
      nextStep: "確認網址 / 服務名稱、錯誤訊息、HTTP 狀態或截圖；必要時通知二線協助排查。",
      trackingStatus: "需追蹤",
      notified: "待回覆通報窗口。",
    },
  },
  {
    id: "backup",
    label: "備份失敗",
    fields: {
      title: "備份失敗告警待確認",
      severity: "Warning / 警告",
      status: "Triage / 初步判斷",
      source: "Email",
      problemDescription: "備份作業失敗或未完成，需確認失敗時間、任務名稱、錯誤訊息與是否有可用備份點。",
      impact: "目前先確認是否影響還原能力；若為連續失敗或重要系統需優先升級處理。",
      nextStep: "確認備份平台錯誤原因、最近成功時間與重跑可行性；必要時通知系統負責人或二線。",
      trackingStatus: "需追蹤",
      notified: "待通知系統負責人。",
    },
  },
  {
    id: "network",
    label: "VPN / 線路",
    fields: {
      title: "VPN / 線路連線異常待確認",
      severity: "Service Impact / 服務影響",
      status: "Triage / 初步判斷",
      source: "Customer",
      problemDescription: "收到 VPN 或線路連線異常通報，需確認影響使用者、錯誤訊息、連線時間與是否為單一端點問題。",
      impact: "可能影響遠端連線或站點間服務存取，需先確認影響範圍與替代連線方式。",
      nextStep: "確認連線來源、目的端、錯誤訊息與線路狀態；必要時通知網路窗口或二線協助排查。",
      trackingStatus: "需追蹤",
      notified: "待回覆通報窗口。",
    },
  },
  {
    id: "waiting",
    label: "等回覆觀察",
    fields: {
      title: "等待客戶或窗口回覆",
      severity: "Info / 資訊",
      status: "Waiting / 等待回覆",
      problemDescription: "目前已完成初步回覆或處理，待客戶 / 窗口補充結果或確認是否仍有異常。",
      impact: "待回覆確認，暫無新的影響資訊。",
      nextStep: "待客戶或窗口回覆後再更新處理紀錄。",
      trackingStatus: "等客戶回覆",
      notified: "已回覆客戶 / 窗口目前處理狀態。",
    },
  },
];
const SERVICE_TYPE_HINTS = {
  general: "一般諮詢只保留後續處理與其他補充，避免不必要的報修欄位干擾。",
  repair: "產品報修會顯示產品、合約、序號與對接窗口欄位。",
  aws: "AWS 邀請組織先保留產品與窗口資訊；帳號、組織或特殊需求可寫在其他補充。",
  other: "其他類型只保留窗口與補充欄位，需要的背景請寫在其他補充。",
  empty: "選擇服務類型後，下方只會顯示相關補充欄位。",
};
const PHONE_TEST_NUMBER = "+886800008669";
const PHONE_TEST_POST_CONNECT_KEY = "3";
const ONCALL_CHECKLIST_STORAGE_PREFIX = "msp_oncall_checklist:";
const HANDOVER_SUMMARY_MODES = {
  full: "完整",
  compact: "精簡",
  update: "更新",
};
let incidentRecordsCache = [];
let activeIncidentRecordId = "";
let activeIncidentSavedSnapshot = null;
let incidentHistoryView = "open";
let handoverSummaryMode = "full";
let oncallChecklistStatusTimer = null;
let incidentHistoryFilters = {
  keyword: "",
  customer: "",
  system: "",
  focus: "",
};

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
  const nextActiveId = String(id || "");
  if (nextActiveId !== activeIncidentRecordId) {
    activeIncidentSavedSnapshot = null;
  }
  activeIncidentRecordId = nextActiveId;

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

function compactComparableMap(map, valueMapper = (value) => String(value || "").trim()) {
  return Object.keys(map || {})
    .sort()
    .reduce((result, key) => {
      const value = valueMapper(map[key]);
      if (value) result[key] = value;
      return result;
    }, {});
}

function normalizeComparableIncidentState(state) {
  const incidentState = state || {};

  return {
    fields: compactComparableMap(incidentState.fields),
    checks: compactComparableMap(incidentState.checks, (value) => (value ? "1" : "")),
    radios: compactComparableMap(incidentState.radios),
    followups: compactComparableMap(incidentState.followups, (value) => (value ? "1" : "")),
  };
}

function setActiveIncidentSavedSnapshot(record) {
  activeIncidentSavedSnapshot = record && record.incident
    ? normalizeComparableIncidentState(record.incident)
    : null;
}

function getActiveIncidentRecord() {
  if (!activeIncidentRecordId) return null;
  return incidentRecordsCache.find((record) => record.id === activeIncidentRecordId) || null;
}

function hasCurrentIncidentUnsavedChanges(state = readIncidentStateFromPage()) {
  if (!hasIncidentContent(state)) return false;

  const currentSnapshot = normalizeComparableIncidentState(state);
  const cachedRecord = getActiveIncidentRecord();
  const savedSnapshot = activeIncidentSavedSnapshot
    || (cachedRecord && normalizeComparableIncidentState(cachedRecord.incident));

  if (!activeIncidentRecordId || !savedSnapshot) return true;
  return JSON.stringify(currentSnapshot) !== JSON.stringify(savedSnapshot);
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

function getIncidentFieldByName(fieldName) {
  return getIncidentFields().find((field) => field.dataset.incidentField === fieldName) || null;
}

function getIncidentTemplateById(templateId) {
  return INCIDENT_TEMPLATES.find((template) => template.id === templateId) || null;
}

function updateIncidentTemplateApplyState() {
  const select = document.getElementById("incidentTemplateSelect");
  const button = document.getElementById("applyIncidentTemplateButton");
  if (!select || !button) return;

  button.disabled = !select.value;
}

function initIncidentTemplates() {
  const select = document.getElementById("incidentTemplateSelect");
  if (!select) return;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選擇常見情境";
  const options = INCIDENT_TEMPLATES.map((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    return option;
  });

  select.replaceChildren(placeholder, ...options);
  select.addEventListener("change", updateIncidentTemplateApplyState);
  updateIncidentTemplateApplyState();
}

function applyIncidentTemplateField(fieldName, value) {
  const field = getIncidentFieldByName(fieldName);
  if (!field || String(field.value || "").trim()) return false;

  field.value = normalizeIncidentFieldValue(fieldName, value);
  return Boolean(String(field.value || "").trim());
}

function applyIncidentTemplateRadio(radioName, value) {
  if (getSelectedIncidentRadioValue(radioName)) return false;

  const radio = getIncidentRadios().find((item) => (
    item.dataset.incidentRadio === radioName && item.value === value
  ));
  if (!radio) return false;

  radio.checked = true;
  return true;
}

function applyIncidentTemplateFollowup(followupName, value) {
  const followup = getIncidentFollowups().find((item) => item.dataset.incidentFollowup === followupName);
  if (!followup || followup.checked === Boolean(value)) return false;

  followup.checked = Boolean(value);
  return true;
}

function applySelectedIncidentTemplate() {
  const select = document.getElementById("incidentTemplateSelect");
  const template = select ? getIncidentTemplateById(select.value) : null;
  if (!select || !template) return;

  const appliedFields = Object.entries(template.fields || {})
    .filter(([fieldName, value]) => applyIncidentTemplateField(fieldName, value)).length;
  const appliedRadios = Object.entries(template.radios || {})
    .filter(([radioName, value]) => applyIncidentTemplateRadio(radioName, value)).length;
  const appliedFollowups = Object.entries(template.followups || {})
    .filter(([followupName, value]) => applyIncidentTemplateFollowup(followupName, value)).length;
  const appliedCount = appliedFields + appliedRadios + appliedFollowups;

  updateIncidentNextCheckAvailability();
  updateServiceTypeFieldVisibility();
  saveIncidentState();
  updateHandoverSummary();

  select.value = "";
  updateIncidentTemplateApplyState();

  setHandoverSummaryStatus(
    appliedCount
      ? `已套用事件樣板：${template.label}`
      : "目前欄位已有內容；樣板未覆蓋任何欄位。",
    appliedCount ? "success" : "pending",
  );
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

  updateIncidentNextCheckAvailability();
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

function setIncidentNow() {
  const startedAt = document.getElementById("incidentStartedAt");
  startedAt.value = formatLocalDateTime(new Date());
  saveIncidentState();
  updateHandoverSummary();
}

function clearIncidentNextCheckAt() {
  const nextCheckAt = document.getElementById("incidentNextCheckAt");
  if (!nextCheckAt) return;

  nextCheckAt.value = "";
  saveIncidentState();
  setHandoverSummaryStatus("");
  updateHandoverSummary();
}

function updateIncidentNextCheckAvailability() {
  const trackingStatus = document.getElementById("incidentTrackingStatus");
  const nextCheckAt = document.getElementById("incidentNextCheckAt");
  if (!trackingStatus || !nextCheckAt) return;

  const shouldDisable = canTrackingStatusSkipNextCheck(trackingStatus.value);
  if (shouldDisable) {
    nextCheckAt.value = "";
  }
  nextCheckAt.disabled = shouldDisable;
  nextCheckAt.title = shouldDisable ? "目前追蹤狀態不需要下次確認" : "";
}

function getActiveIncidentRecordFields() {
  const record = getActiveIncidentRecord();
  return record ? getIncidentRecordFields(record) : null;
}

function buildHandoverSummary(mode = handoverSummaryMode) {
  return window.CounterAppHandoverSummary.buildHandoverSummary(readIncidentStateFromPage(), {
    mode,
    previousFields: getActiveIncidentRecordFields(),
  });
}

function updateHandoverSummary() {
  const output = document.getElementById("handoverSummary");
  if (output) {
    output.value = buildHandoverSummary();
  }

  updateHandoverSummaryBadge();
  renderIncidentNotesTimeline();
  renderDuplicateIncidentStatus();
  renderHandoverReadiness();
}

function updateHandoverSummaryModeButtons() {
  Object.keys(HANDOVER_SUMMARY_MODES).forEach((mode) => {
    const button = document.getElementById(`handoverSummaryMode${mode[0].toUpperCase()}${mode.slice(1)}`);
    if (!button) return;

    const isActive = handoverSummaryMode === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setHandoverSummaryMode(mode) {
  handoverSummaryMode = Object.prototype.hasOwnProperty.call(HANDOVER_SUMMARY_MODES, mode)
    ? mode
    : "full";
  updateHandoverSummaryModeButtons();
  setHandoverSummaryStatus("");
  updateHandoverSummary();
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

function updateHandoverSummaryBadge(state = readIncidentStateFromPage()) {
  const badge = document.getElementById("handoverSummaryBadge");
  if (!badge) return;

  const missingFields = getMissingHandoverSummaryFields(state);
  const isComplete = missingFields.length === 0;
  badge.className = `summary-badge ${isComplete ? "complete" : "missing"}`;
  badge.textContent = isComplete ? "摘要完整" : `缺 ${missingFields.length} 項`;
  badge.title = isComplete
    ? "交班摘要可複製"
    : `尚缺：${missingFields.map((item) => item.label).join("、")}`;
}

function setHandoverSummaryMissingStatus(missingFields) {
  const status = document.getElementById("handoverSummaryStatus");
  if (!status) return;

  status.className = "handover-summary-status error";

  const nodes = [document.createTextNode("交班摘要還缺：")];
  missingFields.forEach((item, index) => {
    if (index > 0) nodes.push(document.createTextNode("、"));

    const button = document.createElement("button");
    button.type = "button";
    button.className = "missing-field-link";
    button.textContent = item.label;
    button.addEventListener("click", () => focusHandoverSummaryField(item));
    nodes.push(button);
  });
  nodes.push(document.createTextNode("。"));

  status.replaceChildren(...nodes);
}

function scrollToIncidentHistory() {
  const history = document.querySelector(".incident-history");
  if (history) {
    history.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

function clearIncidentHistoryFilters() {
  incidentHistoryFilters = {
    keyword: "",
    customer: "",
    system: "",
    focus: "",
  };

  const search = document.getElementById("incidentHistorySearch");
  const customer = document.getElementById("incidentHistoryCustomerFilter");
  const system = document.getElementById("incidentHistorySystemFilter");
  if (search) search.value = "";
  if (customer) customer.value = "";
  if (system) system.value = "";
}

function createInlineAction(label, onClick, className = "readiness-action") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function getOpenIncidentRecords(records = incidentRecordsCache) {
  return (records || []).filter((record) => !isIncidentRecordResolved(record));
}

function getRecordsMissingNextStep(records = incidentRecordsCache) {
  return getOpenIncidentRecords(records).filter(isIncidentRecordMissingNextStep);
}

function setIncidentHistoryFocus(focusName) {
  incidentHistoryFilters.focus = incidentHistoryFilters.focus === focusName ? "" : focusName;
  setIncidentHistoryView("open");
}

function renderHandoverReadiness(state = readIncidentStateFromPage()) {
  const bar = document.getElementById("handoverReadinessBar");
  if (!bar) return;

  const currentHasContent = hasIncidentContent(state);
  const missingSummaryFields = currentHasContent ? getMissingHandoverSummaryFields(state) : [];
  const dueRecords = getOpenIncidentRecords().filter(isIncidentRecordDue);
  const recordsMissingNextStep = getRecordsMissingNextStep();
  const readyToResolveRecords = getOpenIncidentRecords().filter(isIncidentRecordReadyToResolve);
  const staleResolvedRecords = incidentRecordsCache.filter(isIncidentRecordResolved);
  const issues = [];

  if (missingSummaryFields.length) {
    issues.push({
      label: `摘要待補 ${missingSummaryFields.length} 項`,
      action: () => {
        setHandoverSummaryMissingStatus(missingSummaryFields);
        focusHandoverSummaryField(missingSummaryFields[0]);
      },
    });
  }

  if (hasCurrentIncidentUnsavedChanges(state)) {
    issues.push({
      label: activeIncidentRecordId ? "目前事件未更新" : "目前事件未儲存",
      action: () => saveIncidentRecord(),
    });
  }

  if (dueRecords.length) {
    issues.push({
      label: `待確認 ${dueRecords.length} 件`,
      action: () => {
        clearIncidentHistoryFilters();
        setIncidentHistoryView("open");
        scrollToIncidentHistory();
      },
    });
  }

  if (recordsMissingNextStep.length) {
    issues.push({
      label: `未填下一步 ${recordsMissingNextStep.length} 件`,
      action: () => {
        clearIncidentHistoryFilters();
        setIncidentHistoryView("open");
        scrollToIncidentHistory();
      },
    });
  }

  if (readyToResolveRecords.length) {
    issues.push({
      label: `可結案 ${readyToResolveRecords.length} 件`,
      action: () => {
        clearIncidentHistoryFilters();
        setIncidentHistoryView("open");
        scrollToIncidentHistory();
      },
    });
  }

  if (staleResolvedRecords.length && incidentHistoryView === "open") {
    issues.push({
      label: `已解決仍在列表 ${staleResolvedRecords.length} 件`,
      action: () => loadIncidentRecords({ showLoading: false }),
    });
  }

  const isReady = issues.length === 0;
  bar.className = `handover-readiness-bar ${isReady ? "ready" : "attention"}`;

  const label = createTextElement("span", "readiness-label", isReady ? "可交班" : `交班提醒 ${issues.length} 項`);
  const message = createTextElement(
    "span",
    "readiness-message",
    isReady ? "摘要與未結案事件看起來都完整。" : "這些只是檢查提示，可視情況處理。",
  );
  const actions = document.createElement("div");
  actions.className = "readiness-actions";
  issues.forEach((issue) => {
    actions.appendChild(createInlineAction(issue.label, issue.action));
  });

  bar.replaceChildren(label, message, actions);
}

function parseIncidentNotesTimeline(notes) {
  return String(notes || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(?:(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2})\s+)?(\d{1,2}:\d{2})(?:\s*[-|]\s*)?(.*)$/);
      if (!match) {
        return {
          time: "補充",
          text: line,
          hasTime: false,
        };
      }

      return {
        time: `${match[1] ? `${match[1]} ` : ""}${match[2]}`,
        text: match[3] ? match[3].trim() : line,
        hasTime: true,
      };
    });
}

function renderIncidentNotesTimeline() {
  const timeline = document.getElementById("incidentNotesTimeline");
  const notes = document.getElementById("incidentNotes");
  if (!timeline || !notes) return;

  const entries = parseIncidentNotesTimeline(notes.value);
  if (!entries.length || !entries.some((entry) => entry.hasTime)) {
    timeline.replaceChildren();
    return;
  }

  const meta = createTextElement("div", "notes-timeline-meta", `時間軸 ${entries.length} 筆`);
  const list = document.createElement("div");
  list.className = "notes-timeline-list";

  entries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = entry.hasTime ? "notes-timeline-row" : "notes-timeline-row muted";
    row.appendChild(createTextElement("span", "notes-timeline-time", entry.time));
    row.appendChild(createTextElement("span", "notes-timeline-text", entry.text));
    list.appendChild(row);
  });

  timeline.replaceChildren(meta, list);
}

async function copyHandoverSummary() {
  try {
    const state = readIncidentStateFromPage();
    const missingFields = getMissingHandoverSummaryFields(state);

    if (missingFields.length) {
      setHandoverSummaryMissingStatus(missingFields);
      updateHandoverSummaryBadge(state);
      return;
    }

    updateHandoverSummary();
    const summary = document.getElementById("handoverSummary").value;
    await navigator.clipboard.writeText(summary);

    markIncidentCheck("整理交班資訊");
    saveIncidentState();
    updateHandoverSummary();
    setHandoverSummaryStatus(`已複製${HANDOVER_SUMMARY_MODES[handoverSummaryMode]}交班摘要。`, "success");
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

  markOncallChecklistItem("phone-test", false);
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
  if (!check || check.checked) return false;

  check.checked = true;
  return true;
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
        handoverSummary: buildHandoverSummary("full"),
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

function normalizeIncidentTrackingStatus(value) {
  return String(value || "").trim();
}

function getIncidentRecordTrackingStatus(record) {
  return normalizeIncidentTrackingStatus(getIncidentRecordFields(record).trackingStatus);
}

function canTrackingStatusSkipNextStep(status) {
  const trackingStatus = normalizeIncidentTrackingStatus(status);
  return trackingStatus === "不需追蹤" || trackingStatus === "可結案";
}

function canTrackingStatusSkipNextCheck(status) {
  const trackingStatus = normalizeIncidentTrackingStatus(status);
  return trackingStatus === "不需追蹤" || trackingStatus === "可結案";
}

function shouldIncidentRecordHonorNextCheck(record) {
  return !canTrackingStatusSkipNextCheck(getIncidentRecordTrackingStatus(record));
}

function isIncidentRecordReadyToResolve(record) {
  return !isIncidentRecordResolved(record) && getIncidentRecordTrackingStatus(record) === "可結案";
}

function getIncidentTrackingStatusClass(status) {
  const trackingStatus = normalizeIncidentTrackingStatus(status);
  if (trackingStatus === "不需追蹤") return "none";
  if (trackingStatus === "可結案") return "ready";
  if (trackingStatus === "持續監控" || trackingStatus === "需追蹤") return "monitoring";
  if (trackingStatus === "等客戶回覆" || trackingStatus === "等二線回覆") return "waiting";
  return "";
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
  return Boolean(nextCheckAt
    && shouldIncidentRecordHonorNextCheck(record)
    && !isIncidentRecordResolved(record)
    && nextCheckAt.getTime() <= Date.now());
}

function isIncidentRecordUpcoming(record, windowMs = 2 * 60 * 60 * 1000) {
  const nextCheckAt = parseIncidentDateTime(getIncidentRecordNextCheckValue(record));
  if (!nextCheckAt || !shouldIncidentRecordHonorNextCheck(record) || isIncidentRecordResolved(record)) {
    return false;
  }

  const nextCheckTime = nextCheckAt.getTime();
  const now = Date.now();
  return nextCheckTime > now && nextCheckTime <= now + windowMs;
}

function isIncidentRecordWaiting(record) {
  const trackingStatus = getIncidentRecordTrackingStatus(record);
  return trackingStatus === "等客戶回覆" || trackingStatus === "等二線回覆";
}

function isIncidentRecordMissingNextStep(record) {
  const fields = getIncidentRecordFields(record);
  return !isIncidentRecordResolved(record)
    && !canTrackingStatusSkipNextStep(fields.trackingStatus)
    && !String(fields.nextStep || "").trim();
}

function getIncidentRecordNextCheckLabel(record) {
  const nextCheckValue = getIncidentRecordNextCheckValue(record);
  if (!nextCheckValue || !shouldIncidentRecordHonorNextCheck(record)) return "";

  const label = isIncidentRecordDue(record) ? "待確認" : "下次確認";
  return `${label} ${formatIncidentRecordTime(nextCheckValue)}`;
}

function getIncidentFocusCounts(records = incidentRecordsCache) {
  const openRecords = getOpenIncidentRecords(records);

  return {
    open: openRecords.length,
    due: openRecords.filter(isIncidentRecordDue).length,
    upcoming: openRecords.filter(isIncidentRecordUpcoming).length,
    missingNextStep: openRecords.filter(isIncidentRecordMissingNextStep).length,
    waiting: openRecords.filter(isIncidentRecordWaiting).length,
    readyToResolve: openRecords.filter(isIncidentRecordReadyToResolve).length,
  };
}

function matchesIncidentHistoryFocus(record) {
  switch (incidentHistoryFilters.focus) {
    case "due":
      return isIncidentRecordDue(record);
    case "upcoming":
      return isIncidentRecordUpcoming(record);
    case "missingNextStep":
      return isIncidentRecordMissingNextStep(record);
    case "waiting":
      return !isIncidentRecordResolved(record) && isIncidentRecordWaiting(record);
    case "readyToResolve":
      return isIncidentRecordReadyToResolve(record);
    default:
      return true;
  }
}

function createIncidentFocusButton(config, counts) {
  const button = document.createElement("button");
  const isActive = incidentHistoryFilters.focus === config.key;
  const count = counts[config.key] || 0;

  button.type = "button";
  button.className = isActive ? "incident-focus-chip active" : "incident-focus-chip";
  button.setAttribute("aria-pressed", String(isActive));
  button.title = config.title || config.label;

  const label = createTextElement("span", "incident-focus-label", config.label);
  const value = createTextElement("strong", "incident-focus-count", String(count));
  button.replaceChildren(label, value);
  button.addEventListener("click", () => setIncidentHistoryFocus(config.key));

  return button;
}

function renderIncidentFocusBar(records = incidentRecordsCache) {
  const bar = document.getElementById("incidentFocusBar");
  if (!bar) return;

  const counts = getIncidentFocusCounts(records);
  const summary = createTextElement("div", "incident-focus-summary", `未結案 ${counts.open} 件`);
  const buttons = [
    { key: "due", label: "待確認", title: "下次確認時間已到或逾期" },
    { key: "upcoming", label: "2 小時內", title: "下次確認時間在 2 小時內" },
    { key: "missingNextStep", label: "缺下一步", title: "仍需追蹤但未填下一步" },
    { key: "waiting", label: "等回覆", title: "正在等待客戶或二線回覆" },
    { key: "readyToResolve", label: "可結案", title: "追蹤狀態已標成可結案" },
  ].map((config) => createIncidentFocusButton(config, counts));

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = incidentHistoryFilters.focus ? "incident-focus-clear visible" : "incident-focus-clear";
  clearButton.textContent = "清除焦點";
  clearButton.disabled = !incidentHistoryFilters.focus;
  clearButton.addEventListener("click", () => setIncidentHistoryFocus(incidentHistoryFilters.focus));

  bar.replaceChildren(summary, ...buttons, clearButton);
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

function normalizeIncidentSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getIncidentSearchTokens(value) {
  return normalizeIncidentSearchText(value)
    .replace(/[^\w\u4e00-\u9fff]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function countSharedIncidentTokens(left, right) {
  const rightTokens = new Set(getIncidentSearchTokens(right));
  return getIncidentSearchTokens(left).filter((token) => rightTokens.has(token)).length;
}

function getIncidentRecordSearchText(record) {
  const fields = getIncidentRecordFields(record);
  return [
    record.title,
    record.summary,
    record.severity,
    record.status,
    record.customer,
    record.system,
    record.source,
    record.handoverSummary,
    fields.problemDescription,
    fields.impact,
    fields.nextStep,
    fields.notes,
  ].join(" ");
}

function isLikelyDuplicateIncident(state, record) {
  if (!record || record.id === activeIncidentRecordId || isIncidentRecordResolved(record)) return false;

  const fields = state.fields || {};
  const recordFields = getIncidentRecordFields(record);
  const title = normalizeIncidentSearchText(fields.title);
  const recordTitle = normalizeIncidentSearchText(record.title || recordFields.title);
  if (!title || !recordTitle) return false;

  const sameCustomer = Boolean(fields.customer && record.customer)
    && normalizeIncidentSearchText(fields.customer) === normalizeIncidentSearchText(record.customer);
  const sameSystem = Boolean(fields.system && record.system)
    && normalizeIncidentSearchText(fields.system) === normalizeIncidentSearchText(record.system);
  const titleContains = title.length >= 8 && recordTitle.length >= 8
    && (title.includes(recordTitle) || recordTitle.includes(title));
  const sharedTokens = countSharedIncidentTokens(title, recordTitle);

  return titleContains
    || sharedTokens >= 2
    || ((sameCustomer || sameSystem) && sharedTokens >= 1);
}

function getDuplicateIncidentMatches(state = readIncidentStateFromPage()) {
  if (!hasIncidentContent(state)) return [];

  return incidentRecordsCache
    .filter((record) => isLikelyDuplicateIncident(state, record))
    .sort(compareIncidentRecordsForDisplay)
    .slice(0, 3);
}

function renderDuplicateIncidentStatus(state = readIncidentStateFromPage()) {
  const status = document.getElementById("duplicateIncidentStatus");
  if (!status) return;

  const matches = getDuplicateIncidentMatches(state);
  if (!matches.length) {
    status.replaceChildren();
    return;
  }

  const label = createTextElement("span", "", "可能已有相似未結案事件：");
  const actions = matches.map((record) => createInlineAction(
    record.title || "未命名事件",
    () => restoreIncidentRecord(record),
    "duplicate-incident-link",
  ));

  status.replaceChildren(label, ...actions);
}

function restoreIncidentRecord(record) {
  if (!record || !record.incident) return;

  applyIncidentStateToPage(record.incident);
  setActiveIncidentRecordId(record.id);
  setActiveIncidentSavedSnapshot(record);
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
      setActiveIncidentSavedSnapshot(data.incident);
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
  card.classList.toggle("ready-to-resolve", isIncidentRecordReadyToResolve(record));

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
  const trackingStatus = getIncidentRecordTrackingStatus(record);
  if (isIncidentRecordResolved(record)) {
    side.appendChild(createTextElement("div", "incident-record-state", "已解決"));
  } else if (trackingStatus) {
    side.appendChild(createTextElement(
      "div",
      `incident-record-tracking ${getIncidentTrackingStatusClass(trackingStatus)}`.trim(),
      trackingStatus,
    ));
  }

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

  if (record.summary) {
    titleBlock.appendChild(createTextElement("p", "incident-record-summary", record.summary));
  }

  top.appendChild(titleBlock);
  top.appendChild(side);
  body.appendChild(top);
  card.appendChild(body);

  return card;
}

function getUniqueIncidentFilterValues(records, fieldName) {
  return Array.from(new Set((records || [])
    .map((record) => String(record[fieldName] || getIncidentRecordFields(record)[fieldName] || "").trim())
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function setIncidentFilterOptions(select, placeholder, values, currentValue) {
  if (!select) return "";

  const options = [""].concat(values);
  const nextValue = options.includes(currentValue) ? currentValue : "";

  select.replaceChildren(...options.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || placeholder;
    return option;
  }));
  select.value = nextValue;
  return nextValue;
}

function renderIncidentHistoryFilterOptions(records) {
  incidentHistoryFilters.customer = setIncidentFilterOptions(
    document.getElementById("incidentHistoryCustomerFilter"),
    "全部客戶",
    getUniqueIncidentFilterValues(records, "customer"),
    incidentHistoryFilters.customer,
  );
  incidentHistoryFilters.system = setIncidentFilterOptions(
    document.getElementById("incidentHistorySystemFilter"),
    "全部系統",
    getUniqueIncidentFilterValues(records, "system"),
    incidentHistoryFilters.system,
  );
}

function getFilteredIncidentRecords(records) {
  const keyword = normalizeIncidentSearchText(incidentHistoryFilters.keyword);
  const keywords = keyword ? keyword.split(/\s+/).filter(Boolean) : [];

  return (records || []).filter((record) => {
    if (!matchesIncidentHistoryFocus(record)) return false;

    const fields = getIncidentRecordFields(record);
    const customer = String(record.customer || fields.customer || "").trim();
    const system = String(record.system || fields.system || "").trim();
    if (incidentHistoryFilters.customer && customer !== incidentHistoryFilters.customer) return false;
    if (incidentHistoryFilters.system && system !== incidentHistoryFilters.system) return false;

    if (!keywords.length) return true;
    const searchableText = normalizeIncidentSearchText(getIncidentRecordSearchText(record));
    return keywords.every((item) => searchableText.includes(item));
  });
}

function initIncidentHistoryFilters() {
  const search = document.getElementById("incidentHistorySearch");
  const customer = document.getElementById("incidentHistoryCustomerFilter");
  const system = document.getElementById("incidentHistorySystemFilter");

  if (search) {
    search.addEventListener("input", () => {
      incidentHistoryFilters.keyword = search.value;
      renderIncidentRecords(incidentRecordsCache);
    });
  }

  if (customer) {
    customer.addEventListener("change", () => {
      incidentHistoryFilters.customer = customer.value;
      renderIncidentRecords(incidentRecordsCache);
    });
  }

  if (system) {
    system.addEventListener("change", () => {
      incidentHistoryFilters.system = system.value;
      renderIncidentRecords(incidentRecordsCache);
    });
  }
}

function renderIncidentRecords(records) {
  const list = document.getElementById("incidentHistoryList");
  if (!list) return;

  incidentRecordsCache = Array.isArray(records) ? records : [];
  renderIncidentHistoryFilterOptions(incidentRecordsCache);
  renderIncidentFocusBar(incidentRecordsCache);

  if (!records || records.length === 0) {
    const emptyText = incidentHistoryView === "all"
      ? "目前還沒有儲存的事件紀錄"
      : "目前沒有未結案事件紀錄";
    list.replaceChildren(createTextElement("div", "incident-history-empty", emptyText));
    renderHandoverReadiness();
    renderDuplicateIncidentStatus();
    return;
  }

  const filteredRecords = getFilteredIncidentRecords(records);
  if (!filteredRecords.length) {
    list.replaceChildren(createTextElement("div", "incident-history-empty", "沒有符合篩選的事件紀錄"));
    renderHandoverReadiness();
    renderDuplicateIncidentStatus();
    return;
  }

  const sortedRecords = [...filteredRecords].sort(compareIncidentRecordsForDisplay);
  list.replaceChildren(...sortedRecords.map(createIncidentRecordCard));
  renderHandoverReadiness();
  renderDuplicateIncidentStatus();
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
  if (incidentHistoryView === "all") {
    incidentHistoryFilters.focus = "";
  }
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
      limit: "50",
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
    const activeRecord = getActiveIncidentRecord();
    if (activeRecord) {
      setActiveIncidentSavedSnapshot(activeRecord);
    }
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
        handoverSummary: buildHandoverSummary("full"),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Save incident failed");
    }

    setActiveIncidentRecordId(data.incident.id);
    setActiveIncidentSavedSnapshot(data.incident);
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

  updateIncidentNextCheckAvailability();
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
  initIncidentTemplates();
  initIncidentHistoryFilters();
  updateHandoverSummaryModeButtons();
  loadIncidentState();
  updateServiceTypeFieldVisibility();
  loadActiveIncidentRecordId();
  if (!hasIncidentContent(readIncidentStateFromPage())) {
    setActiveIncidentRecordId("");
  }
  updateHandoverSummary();
  const syncIncidentState = () => {
    updateIncidentNextCheckAvailability();
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
        ...((section.copyGroups || []).flatMap((group) => [
          group.label,
          group.copyLabel,
          group.text,
        ])),
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

function getRunbookLinkAliases(runbook) {
  const aliases = [];
  const seen = new Set();

  (runbook.links || []).forEach((link) => {
    const candidates = [link.label];

    if (link.label === "iTop") {
      candidates.push("ITop", "ITOP");
    }

    if (link.href && link.href.includes("subnet.min.io")) {
      candidates.push("MINIO Subnet", "MinIO Subnet", "Subnet 登入頁面", "Subnet");
    }

    if (link.label === "原 SOP") {
      candidates.push("原 SOP");
    }

    if (link.label === "通話記錄用表格") {
      candidates.push("通話記錄用表格", "通話記錄表格", "紀錄表單", "記錄表單");
    }

    if (link.label === "Akamai SE 分工表 & 合約表") {
      candidates.push("Akamai SE 分工表", "SE 分工表", "SE分工表", "Akamai 合約表", "合約表");
    }

    if (link.label === "Akamai 流程問題意見回覆表") {
      candidates.push("流程問題意見回覆表", "MSP 維運問題紀錄");
    }

    candidates.forEach((candidate) => {
      const alias = String(candidate || "").trim();
      const key = alias.toLowerCase();

      if (!alias || seen.has(key)) return;

      seen.add(key);
      aliases.push({
        alias,
        aliasLower: key,
        href: link.href,
      });
    });
  });

  return aliases.sort((a, b) => b.alias.length - a.alias.length);
}

function appendRunbookLinkedText(parent, text, runbook) {
  const value = String(text || "");
  const valueLower = value.toLowerCase();
  const aliases = getRunbookLinkAliases(runbook);
  let cursor = 0;

  while (cursor < value.length) {
    let nextMatch = null;

    aliases.forEach((alias) => {
      const index = valueLower.indexOf(alias.aliasLower, cursor);

      if (index === -1) return;
      if (!nextMatch || index < nextMatch.index || (
        index === nextMatch.index && alias.alias.length > nextMatch.alias.alias.length
      )) {
        nextMatch = { alias, index };
      }
    });

    if (!nextMatch) {
      parent.appendChild(document.createTextNode(value.slice(cursor)));
      break;
    }

    if (nextMatch.index > cursor) {
      parent.appendChild(document.createTextNode(value.slice(cursor, nextMatch.index)));
    }

    const anchor = document.createElement("a");
    anchor.className = "runbook-inline-link";
    anchor.href = nextMatch.alias.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = value.slice(
      nextMatch.index,
      nextMatch.index + nextMatch.alias.alias.length,
    );
    parent.appendChild(anchor);

    cursor = nextMatch.index + nextMatch.alias.alias.length;
  }
}

async function copyTextToClipboard(text) {
  const value = String(text || "");

  if (navigator.clipboard && window.isSecureContext !== false) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function setTemporaryButtonText(button, text, duration = 1400) {
  const originalText = button.dataset.originalText || button.textContent;
  button.dataset.originalText = originalText;
  button.textContent = text;
  window.clearTimeout(Number(button.dataset.resetTimer || 0));

  const timer = window.setTimeout(() => {
    button.textContent = originalText;
    button.dataset.resetTimer = "";
  }, duration);
  button.dataset.resetTimer = String(timer);
}

function createRunbookCopyButton(items, label = "複製") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "runbook-copy-button";
  button.textContent = label;
  button.setAttribute("aria-label", "複製此段內容");

  button.addEventListener("click", async () => {
    try {
      await copyTextToClipboard((items || []).join("\n"));
      setTemporaryButtonText(button, "已複製");
    } catch (err) {
      setTemporaryButtonText(button, "複製失敗");
    }
  });

  return button;
}

function getRunbookCopyGroupButtonLabel(group) {
  const copyLabel = String(group && group.copyLabel ? group.copyLabel : "").trim();
  if (copyLabel) return copyLabel;

  const label = String(group && group.label ? group.label : "").trim();
  const shortLabel = label.replace(/\s*Team$/i, "");

  return shortLabel ? `複製 ${shortLabel}` : "複製";
}

function getRunbookLinkButtonLabel(link) {
  const label = String(link && link.label ? link.label : "").trim();

  if (!label) return "開啟連結";
  if (/^開啟/.test(label)) return label;
  if (label === "Subnet 登入頁面") return "開啟 Subnet";

  return /^[A-Za-z0-9]/.test(label) ? `開啟 ${label}` : `開啟${label}`;
}

function getRunbookListItemClass(item) {
  const normalizedItem = String(item || "").trim();

  if (normalizedItem.startsWith("※") || normalizedItem.startsWith("⚠️")) {
    return "runbook-note-line";
  }

  if (
    /^\d+\.\s/.test(normalizedItem)
    || /^Step\s*\d+\./i.test(normalizedItem)
    || /^[①②③✔✘✓ＯＸX→•]/.test(normalizedItem)
    || /^[是否]\s*->/.test(normalizedItem)
  ) {
    return "runbook-numbered-line";
  }

  return "";
}

function appendRunbookCopyGroups(parent, copyGroups, runbook) {
  if (!copyGroups || copyGroups.length === 0) return;

  const groups = document.createElement("div");
  groups.className = "runbook-copy-groups";
  if (copyGroups.length > 4) {
    groups.classList.add("runbook-copy-groups-many");
  }

  copyGroups.forEach((group) => {
    const row = document.createElement("div");
    row.className = "runbook-copy-group";

    const header = document.createElement("div");
    header.className = "runbook-copy-group-header";
    header.appendChild(createTextElement("strong", "runbook-copy-group-label", group.label));
    header.appendChild(createRunbookCopyButton([group.text], getRunbookCopyGroupButtonLabel(group)));

    const value = document.createElement("div");
    value.className = "runbook-copy-group-value";
    appendRunbookLinkedText(value, group.text, runbook);

    row.appendChild(header);
    row.appendChild(value);
    groups.appendChild(row);
  });

  parent.appendChild(groups);
}

function appendRunbookList(parent, title, items, runbook, options = {}) {
  const copyGroups = options.copyGroups || [];
  if ((!items || items.length === 0) && copyGroups.length === 0) return;

  const section = document.createElement("div");
  section.className = "runbook-detail";
  if (options.wide) {
    section.classList.add("wide");
  }

  const heading = document.createElement("div");
  heading.className = "runbook-detail-heading";
  heading.appendChild(createTextElement("h4", "", title));

  if (/聯絡資訊|信件收件人/.test(title) && items && items.length > 0 && copyGroups.length === 0) {
    heading.appendChild(createRunbookCopyButton(items, "複製"));
  }

  section.appendChild(heading);

  if (items && items.length > 0) {
    const list = document.createElement("ul");
    items.forEach((item) => {
      const listItem = document.createElement("li");
      const itemClass = getRunbookListItemClass(item);

      if (itemClass) {
        listItem.className = itemClass;
      }

      appendRunbookLinkedText(listItem, item, runbook);
      list.appendChild(listItem);
    });

    section.appendChild(list);
  }

  appendRunbookCopyGroups(section, copyGroups, runbook);
  parent.appendChild(section);
}

function appendRunbookExtraSections(parent, sections, runbook) {
  // 不同產品的 SOP 會有自己的特殊段落。
  // extraSections 讓資料可以自由新增「案件追蹤」「Case 範本」「Q&A」等內容。
  (sections || []).forEach((section) => {
    appendRunbookList(parent, section.title, section.items, runbook, {
      copyGroups: section.copyGroups || [],
      wide: section.wide,
    });
  });
}

function normalizeRunbookDraftText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripRunbookStepPrefix(value) {
  return normalizeRunbookDraftText(value)
    .replace(/^\d+\s*[.、)]\s*/, "")
    .trim();
}

function truncateRunbookDraftText(value, maxLength = 120) {
  const text = normalizeRunbookDraftText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function getRunbookExtraSectionItems(runbook, titleKeywords) {
  const keywords = titleKeywords.map((keyword) => String(keyword || "").toLowerCase());

  return (runbook.extraSections || [])
    .filter((section) => {
      const title = String(section.title || "").toLowerCase();
      return keywords.some((keyword) => title.includes(keyword));
    })
    .flatMap((section) => section.items || []);
}

function getRunbookDraftActionItem(runbook) {
  const candidates = [
    ...(runbook.firstChecks || []),
    ...getRunbookExtraSectionItems(runbook, ["先確認", "值班步驟", "處理步驟"]),
    ...(runbook.steps || []),
    ...getRunbookExtraSectionItems(runbook, ["需回覆", "信件判斷", "觸發情境"]),
    ...(runbook.triggers || []),
    runbook.summary,
  ];

  return candidates
    .map(stripRunbookStepPrefix)
    .find(Boolean) || "";
}

function inferRunbookIncidentSeverity(runbook) {
  const text = [
    runbook.title,
    runbook.summary,
    runbook.severity,
    ...(runbook.triggers || []),
    ...(runbook.escalateWhen || []),
  ].join(" ").toLowerCase();

  if (/critical|panic|p1|重大|中斷|不可用|服務影響/.test(text)) {
    return "Service Impact / 服務影響";
  }

  if (/info|資訊|不需處理|參考/.test(text)) {
    return "Info / 資訊";
  }

  return "Warning / 警告";
}

function getRunbookDraftNextStep(runbook) {
  const actionItem = truncateRunbookDraftText(getRunbookDraftActionItem(runbook));

  return actionItem
    ? `依 SOP 先確認：${actionItem}`
    : "依 SOP 完成初步檢查，補上影響範圍並視情況通知二線或窗口。";
}

function getRunbookDraftNotes(runbook) {
  const lines = [`${formatLocalTimeMinute()} 已查閱 SOP：${runbook.title || "未命名 SOP"}`];
  const categoryName = getRunbookCategoryName(runbook.category);
  const summary = truncateRunbookDraftText(runbook.summary, 180);
  const actionItem = truncateRunbookDraftText(getRunbookDraftActionItem(runbook), 160);

  if (categoryName) lines.push(`分類：${categoryName}`);
  if (summary) lines.push(`摘要：${summary}`);
  if (actionItem) lines.push(`初步依據：${actionItem}`);

  return lines.join("\n");
}

function buildRunbookIncidentDraftFields(runbook) {
  const title = runbook.title || "SOP";
  const categoryName = getRunbookCategoryName(runbook.category);
  const summary = truncateRunbookDraftText(runbook.summary, 180);

  return {
    startedAt: formatLocalDateTime(new Date()),
    severity: inferRunbookIncidentSeverity(runbook),
    status: "Triage / 初步判斷",
    title: `${title} 待確認`,
    problemDescription: [
      `已查閱 SOP：${title}`,
      summary ? `摘要：${summary}` : "",
      categoryName ? `分類：${categoryName}` : "",
    ].filter(Boolean).join("\n"),
    impact: "待確認實際影響範圍、受影響對象與是否已有 workaround。",
    nextStep: getRunbookDraftNextStep(runbook),
    trackingStatus: "需追蹤",
    notes: getRunbookDraftNotes(runbook),
  };
}

function focusIncidentDraft() {
  const title = document.getElementById("incidentTitle");

  setActiveView("dashboard", { scrollTop: false });

  if (title) {
    title.scrollIntoView({ behavior: "smooth", block: "center" });
    title.focus();
  }
}

function applyRunbookToIncidentDraft(runbook) {
  if (!runbook) return;

  const hadDraftContent = hasIncidentContent(readIncidentStateFromPage());
  const appliedFields = Object.entries(buildRunbookIncidentDraftFields(runbook))
    .filter(([fieldName, value]) => applyIncidentTemplateField(fieldName, value)).length;
  const appliedChecklist = markIncidentCheck("查閱對應 SOP") ? 1 : 0;
  const appliedCount = appliedFields + appliedChecklist;

  updateIncidentNextCheckAvailability();
  updateServiceTypeFieldVisibility();
  saveIncidentState();
  updateHandoverSummary();
  focusIncidentDraft();

  if (appliedCount) {
    setHandoverSummaryStatus(
      hadDraftContent
        ? `已從 SOP 補入事件草稿空白欄位：${runbook.title}`
        : `已從 SOP 建立事件草稿：${runbook.title}`,
      "success",
    );
    return;
  }

  setHandoverSummaryStatus("目前事件欄位已有內容；Runbook 未覆蓋既有草稿。", "pending");
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

  const metaLabel = runbook.severityLabel || "嚴重度";
  const meta = createTextElement("div", "runbook-card-meta", `${metaLabel}：${runbook.severity || "未分類"}`);

  const body = document.createElement("div");
  body.className = "runbook-card-body";
  appendRunbookList(body, "值班規則", runbook.dutyRules, runbook);
  appendRunbookList(body, "信件判斷", runbook.replyRules, runbook);
  appendRunbookList(body, "不需處理", runbook.ignoreRules, runbook);
  appendRunbookList(body, "觸發情境", runbook.triggers, runbook);
  appendRunbookList(body, "先確認", runbook.firstChecks, runbook);
  appendRunbookList(body, "處理步驟", runbook.steps, runbook);
  appendRunbookList(body, "升級條件", runbook.escalateWhen, runbook);
  appendRunbookList(body, "聯絡資訊", runbook.contacts, runbook);
  appendRunbookList(body, "信件收件人", runbook.mailRecipients, runbook);
  appendRunbookExtraSections(body, runbook.extraSections, runbook);

  const actions = document.createElement("div");
  actions.className = "runbook-actions";

  const draftButton = document.createElement("button");
  draftButton.type = "button";
  draftButton.className = "runbook-link runbook-draft-button";
  draftButton.textContent = "帶入事件草稿";
  draftButton.addEventListener("click", () => applyRunbookToIncidentDraft(runbook));
  actions.appendChild(draftButton);

  (runbook.links || []).forEach((link) => {
    const anchor = document.createElement("a");
    anchor.className = "runbook-link";
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = getRunbookLinkButtonLabel(link);
    actions.appendChild(anchor);
  });

  const relatedLinks = document.createElement("div");
  relatedLinks.className = "runbook-related-links";
  relatedLinks.appendChild(createTextElement("h4", "runbook-related-title", "快速動作"));
  relatedLinks.appendChild(actions);

  card.appendChild(header);
  card.appendChild(meta);
  if (actions.children.length > 0) {
    card.appendChild(relatedLinks);
  }
  card.appendChild(body);

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

function getOncallChecklistDateKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
}

function getOncallChecklistStorageKey() {
  return `${ONCALL_CHECKLIST_STORAGE_PREFIX}${getOncallChecklistDateKey()}`;
}

function getOncallChecklistInputs() {
  return Array.from(document.querySelectorAll("[data-oncall-check]"));
}

function setOncallChecklistStatus(message, type) {
  const status = document.getElementById("oncallChecklistStatus");
  if (!status) return;

  window.clearTimeout(oncallChecklistStatusTimer);
  status.className = type ? `oncall-checklist-status ${type}` : "oncall-checklist-status";
  status.textContent = message || "";

  if (message) {
    oncallChecklistStatusTimer = window.setTimeout(() => {
      status.textContent = "";
      status.className = "oncall-checklist-status";
    }, 2600);
  }
}

function readOncallChecklistState() {
  try {
    const raw = localStorage.getItem(getOncallChecklistStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOncallChecklistState(showStatus = false) {
  const checked = getOncallChecklistInputs().reduce((result, input) => {
    result[input.dataset.oncallCheck] = input.checked;
    return result;
  }, {});

  try {
    localStorage.setItem(getOncallChecklistStorageKey(), JSON.stringify({
      date: getOncallChecklistDateKey(),
      checked,
      updatedAt: new Date().toISOString(),
    }));
  } catch (err) {
    setOncallChecklistStatus("今日檢查儲存失敗：" + err.message, "error");
    return;
  }

  updateOncallChecklistProgress();
  if (showStatus) {
    setOncallChecklistStatus("已更新今日值班檢查。", "success");
  }
}

function updateOncallChecklistProgress() {
  const inputs = getOncallChecklistInputs();
  const meta = document.getElementById("oncallChecklistMeta");
  const panel = document.querySelector(".oncall-checklist");
  const done = inputs.filter((input) => input.checked).length;
  const total = inputs.length;

  if (meta) {
    meta.textContent = total ? `${done} / ${total}` : "0 / 0";
  }

  if (panel) {
    panel.classList.toggle("complete", total > 0 && done === total);
  }
}

function loadOncallChecklistState() {
  const state = readOncallChecklistState();
  const checked = state && state.checked ? state.checked : {};

  getOncallChecklistInputs().forEach((input) => {
    input.checked = Boolean(checked[input.dataset.oncallCheck]);
  });

  updateOncallChecklistProgress();
}

function markOncallChecklistItem(itemId, showStatus = false) {
  const input = getOncallChecklistInputs()
    .find((item) => item.dataset.oncallCheck === itemId);
  if (!input || input.checked) return false;

  input.checked = true;
  saveOncallChecklistState(showStatus);
  return true;
}

function resetOncallChecklist() {
  getOncallChecklistInputs().forEach((input) => {
    input.checked = false;
  });

  saveOncallChecklistState(false);
  setOncallChecklistStatus("已重置今日值班檢查。", "pending");
}

function initOncallChecklist() {
  getOncallChecklistInputs().forEach((input) => {
    input.addEventListener("change", () => saveOncallChecklistState(true));
  });

  loadOncallChecklistState();
}

function openLinkElements(selector) {
  const links = Array.from(document.querySelectorAll(selector))
    .map((link) => link.href)
    .filter(Boolean);

  if (!links.length) {
    alert("沒有可開啟的連結");
    return 0;
  }

  links.forEach((url, idx) => {
    setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), idx * 120);
  });

  return links.length;
}

function openLinkGroup(groupId) {
  return openLinkElements(`#${groupId} a.quick-link`);
}

function openCoreLinks() {
  const openedCount = openLinkGroup("coreLinksGrid");
  if (openedCount) {
    markOncallChecklistItem("open-core", false);
    setOncallChecklistStatus(`已開啟 ${openedCount} 個每日值班入口。`, "success");
  }
}

function updateCoreLinksCount() {
  const count = document.querySelectorAll("#coreLinksGrid a.quick-link").length;
  const label = document.getElementById("coreLinksCount");
  if (!label) return;

  label.textContent = `${count} links`;
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
  updateCoreLinksCount();
  initOncallChecklist();

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
