// 這個檔案是前端互動邏輯。
// 它會呼叫後端 API，例如 /track-view、/count、/increment、/reset。

function setError(message) {
  // 把錯誤訊息顯示在畫面上的紅色 error box。
  const box = document.getElementById("errorBox");
  box.style.display = "block";
  box.textContent = message;
}

function clearError() {
  // 每次重新執行 API 前，先把舊錯誤清掉。
  const box = document.getElementById("errorBox");
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
  runbooks: {
    hash: "sop",
    tabId: "runbooksTab",
    viewId: "runbooksView",
  },
};

function getViewFromHash() {
  const hash = window.location.hash.replace("#", "").toLowerCase();
  return hash === "sop" || hash === "runbooks" || hash === "runbook"
    ? "runbooks"
    : "dashboard";
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
  document.getElementById("today").textContent = data.today;
  updateBadge(data.redis);
}

const WEATHER_POSITION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 5000,
  maximumAge: 10 * 60 * 1000,
};

let weatherPositionCache = null;
let weatherPositionUnavailable = false;

function setWeatherText(message, detail) {
  const meta = document.getElementById("weatherMeta");
  const content = document.getElementById("weatherContent");
  if (meta) meta.textContent = detail || "";
  if (content) content.textContent = message;
}

function formatWeatherPeriod(startTime, endTime) {
  if (!startTime && !endTime) return "最近一段預報";
  const clean = (value) => String(value || "").replace("T", " ").slice(5, 16);
  return `${clean(startTime)} - ${clean(endTime)}`;
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

function createWeatherMetric(label, value) {
  const item = document.createElement("div");
  item.className = "weather-metric";
  item.appendChild(createTextElement("span", "weather-metric-label", label));
  item.appendChild(createTextElement("strong", "", value || "-"));
  return item;
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

  const temperatureUnit = data.temperatureUnit || "C";
  const temperature = data.temperature
    ? `${data.temperature}°${temperatureUnit}`
    : data.minTemperature || data.maxTemperature
      ? `${data.minTemperature || "-"}-${data.maxTemperature || "-"}°${temperatureUnit}`
      : "-";
  const rain = data.rainProbability
    ? `${data.rainProbability}${data.rainProbabilityUnit || "%"}`
    : "-";
  const locationLabel = formatWeatherLocation(data);

  meta.textContent = `${locationLabel} · ${formatWeatherPeriod(data.startTime, data.endTime)}`;
  content.replaceChildren(
    createWeatherMetric("天氣", data.weather || data.weatherDescription),
    createWeatherMetric("溫度", temperature),
    createWeatherMetric("降雨", rain),
    createWeatherMetric("舒適度", data.comfort),
  );
}

async function loadLocalWeather(forceRefresh = false) {
  try {
    setWeatherText("氣象定位中...", "正在取得所在地預報");
    const position = await getWeatherPosition(forceRefresh);
    const params = new URLSearchParams();

    if (forceRefresh) params.set("refresh", "1");
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
          data.hint || `${formatWeatherLocation(data)} · ${data.datasetId || "F-C0032-001"}`,
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
const PHONE_TEST_NUMBER = "+886800008669";
const PHONE_TEST_POST_CONNECT_KEY = "3";

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

    const state = JSON.parse(raw);
    const savedFields = state.fields || {};

    getIncidentFields().forEach((field) => {
      const fieldName = field.dataset.incidentField;
      field.value = Object.prototype.hasOwnProperty.call(savedFields, fieldName)
        ? normalizeIncidentFieldValue(fieldName, savedFields[fieldName])
        : "";
    });

    getIncidentChecks().forEach((check) => {
      check.checked = Boolean(state.checks && state.checks[check.dataset.incidentCheck]);
    });

    getIncidentRadios().forEach((radio) => {
      radio.checked = Boolean(state.radios && state.radios[radio.dataset.incidentRadio] === radio.value);
    });

    getIncidentFollowups().forEach((followup) => {
      followup.checked = Boolean(state.followups && state.followups[followup.dataset.incidentFollowup]);
    });
  } catch (err) {
    setError("事件暫存讀取失敗：" + err.message);
  }
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
  const reportLines = [
    ["產品名稱", fields.productName],
    ["合約編號", fields.contractId],
    ["產品型號", fields.model],
    ["產品序號", fields.serial],
    ["經銷商名稱", fields.dealer],
    ["報修對象", fields.repairTarget],
    ["負責業務 / 工程師", fields.owner],
    ["聯繫方式 / 稱呼", fields.contactMethod],
    ["是否為客戶", radios.isCustomer],
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

async function copyHandoverSummary() {
  try {
    updateHandoverSummary();
    await navigator.clipboard.writeText(document.getElementById("handoverSummary").value);
    alert("已複製交班摘要");
  } catch (err) {
    setError("交班摘要複製失敗：" + err.message);
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

function setCreateJiraButtonLoading(isLoading) {
  const button = document.getElementById("createJiraIssueButton");
  if (!button) return;

  button.disabled = isLoading;
  button.textContent = isLoading ? "建立中..." : "建立 Jira 小卡";
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

  localStorage.removeItem(INCIDENT_STORAGE_KEY);
  setJiraStatus("");
  updateHandoverSummary();
}

function initIncidentPanel() {
  loadIncidentState();
  updateHandoverSummary();
  const syncIncidentState = () => {
    saveIncidentState();
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
loadLocalWeather();
trackView();
loadCount();
setInterval(loadStats, 30000);
setInterval(loadLocalWeather, 10 * 60 * 1000);
