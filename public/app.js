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

function createWeatherMetric(label, value) {
  const item = document.createElement("div");
  item.className = "weather-metric";
  item.appendChild(createTextElement("span", "weather-metric-label", label));
  item.appendChild(createTextElement("strong", "", value || "-"));
  return item;
}

function renderLocalWeather(data) {
  const meta = document.getElementById("weatherMeta");
  const content = document.getElementById("weatherContent");
  if (!meta || !content) return;

  const temperature = data.minTemperature || data.maxTemperature
    ? `${data.minTemperature || "-"}-${data.maxTemperature || "-"}°${data.temperatureUnit || "C"}`
    : "-";
  const rain = data.rainProbability
    ? `${data.rainProbability}${data.rainProbabilityUnit || "%"}`
    : "-";

  meta.textContent = `${data.locationName || "本地區"} · ${formatWeatherPeriod(data.startTime, data.endTime)}`;
  content.replaceChildren(
    createWeatherMetric("天氣", data.weather),
    createWeatherMetric("溫度", temperature),
    createWeatherMetric("降雨", rain),
    createWeatherMetric("舒適度", data.comfort),
  );
}

async function loadLocalWeather(forceRefresh = false) {
  try {
    const query = forceRefresh ? "?refresh=1" : "";
    const res = await fetch(`/api/weather/local${query}`, {
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      if (data && data.configured === false) {
        setWeatherText("尚未設定氣象授權碼", `${data.locationName || "本地區"} · ${data.datasetId || "F-C0032-001"}`);
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

  saveIncidentState();
  updateHandoverSummary();
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

const ONCALL_LINKS_STATE = {
  config: null,
};

async function readJsonResponse(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function setLinksStatus(message, type) {
  const status = document.getElementById("linksStatus");
  if (!status) return;

  status.className = type ? `links-status ${type}` : "links-status";
  status.textContent = message || "";
}

function setLinksEditorStatus(message, type) {
  const status = document.getElementById("linksEditorStatus");
  if (!status) return;

  status.className = type ? `links-editor-status ${type}` : "links-editor-status";
  status.textContent = message || "";
}

function getEditableOncallConfig(data) {
  const config = data || ONCALL_LINKS_STATE.config || {};

  return {
    version: config.version || "",
    note: config.note || "",
    coreLinks: Array.isArray(config.coreLinks) ? config.coreLinks : [],
    groups: Array.isArray(config.groups) ? config.groups : [],
    checklist: Array.isArray(config.checklist) ? config.checklist : [],
  };
}

function formatOncallConfigForEditor(data) {
  return JSON.stringify(getEditableOncallConfig(data), null, 2);
}

function createQuickLink(link) {
  const anchor = document.createElement("a");
  anchor.className = "quick-link";
  anchor.href = link.href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = link.label || link.href;
  return anchor;
}

function renderLinkGrid(container, links) {
  if (!container) return;

  if (!links.length) {
    container.replaceChildren(createTextElement("div", "links-empty", "沒有設定入口"));
    return;
  }

  container.replaceChildren(...links.map(createQuickLink));
}

function renderLinkDrawerGroups(groups) {
  const body = document.getElementById("linkDrawerBody");
  const hint = document.getElementById("moreLinksHint");
  if (!body) return;

  const groupTitles = groups.map((group) => group.title).filter(Boolean);
  if (hint) {
    hint.textContent = groupTitles.length ? groupTitles.join(" / ") : "無備用入口";
  }

  if (!groups.length) {
    body.replaceChildren(createTextElement("div", "links-empty", "沒有備用入口"));
    return;
  }

  const sections = groups.map((group) => {
    const section = document.createElement("div");
    section.className = "link-drawer-section";

    const header = document.createElement("div");
    header.className = "link-section-header compact";
    header.appendChild(createTextElement("h3", "links-title", group.title));
    header.appendChild(createTextElement("span", "link-count", `${group.links.length} links`));

    const grid = document.createElement("div");
    grid.id = `${group.id || "group"}LinksGrid`;
    grid.className = "links-grid drawer-links-grid";
    renderLinkGrid(grid, group.links || []);

    section.appendChild(header);
    section.appendChild(grid);
    return section;
  });

  body.replaceChildren(...sections);
}

function renderOncallChecklist(items) {
  const list = document.getElementById("oncallChecklist");
  if (!list) return;

  if (!items.length) {
    list.replaceChildren(createTextElement("li", "", "尚未設定 checklist。"));
    return;
  }

  list.replaceChildren(...items.map((item) => createTextElement("li", "", item)));
}

function renderOncallLinks(data) {
  ONCALL_LINKS_STATE.config = data;

  const coreLinks = Array.isArray(data.coreLinks) ? data.coreLinks : [];
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const checklist = Array.isArray(data.checklist) ? data.checklist : [];
  const coreLinksGrid = document.getElementById("coreLinksGrid");
  const coreLinksCount = document.getElementById("coreLinksCount");

  if (coreLinksCount) {
    coreLinksCount.textContent = `${coreLinks.length} links`;
  }

  renderLinkGrid(coreLinksGrid, coreLinks);
  renderLinkDrawerGroups(groups);
  renderOncallChecklist(checklist);

  const sourceLabel = data.source === "redis" ? "線上資料" : "預設資料";
  const statusParts = [sourceLabel, data.version ? `v${data.version}` : "", data.redis ? `Redis: ${data.redis}` : ""]
    .filter(Boolean);
  setLinksStatus(statusParts.join(" / "), data.source === "redis" ? "success" : "");
}

async function fetchOncallLinks() {
  const res = await fetch("/api/oncall-links", {
    cache: "no-store",
  });
  const data = await readJsonResponse(res);

  if (!res.ok) {
    throw new Error(data.error || "Load on-call links failed");
  }

  return data;
}

async function loadOncallLinks() {
  try {
    const data = await fetchOncallLinks();
    renderOncallLinks(data);
  } catch (err) {
    setLinksStatus("入口載入失敗：" + err.message, "error");
  }
}

function openLinksEditor() {
  const dialog = document.getElementById("linksEditorDialog");
  const text = document.getElementById("linksEditorText");
  if (!dialog || !text) return;

  text.value = formatOncallConfigForEditor();
  setLinksEditorStatus("");

  if (!dialog.open) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  reloadLinksEditorFromServer();
}

function closeLinksEditor() {
  const dialog = document.getElementById("linksEditorDialog");
  if (!dialog) return;

  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

async function reloadLinksEditorFromServer() {
  const text = document.getElementById("linksEditorText");
  if (!text) return;

  try {
    setLinksEditorStatus("正在載入目前入口...", "pending");
    const data = await fetchOncallLinks();
    renderOncallLinks(data);
    text.value = formatOncallConfigForEditor(data);
    setLinksEditorStatus("已載入目前入口。", "success");
  } catch (err) {
    setLinksEditorStatus("載入失敗：" + err.message, "error");
  }
}

async function saveOncallLinks() {
  const text = document.getElementById("linksEditorText");
  if (!text) return;

  let config;
  try {
    config = JSON.parse(text.value);
  } catch (err) {
    setLinksEditorStatus("JSON 格式錯誤：" + err.message, "error");
    return;
  }

  const token = getResetToken("請輸入入口管理 Token");
  if (!token) {
    setLinksEditorStatus("未輸入入口管理 Token。", "error");
    return;
  }

  try {
    setLinksEditorStatus("正在儲存入口...", "pending");
    const res = await fetch("/api/oncall-links", {
      method: "PUT",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-reset-token": token,
      },
      body: JSON.stringify(config),
    });
    const data = await readJsonResponse(res);

    if (!res.ok) {
      if (res.status === 403) {
        sessionStorage.removeItem("reset_token");
      }

      throw new Error(data.error || "Save on-call links failed");
    }

    renderOncallLinks(data);
    text.value = formatOncallConfigForEditor(data);
    setLinksEditorStatus("已儲存到 Redis。", "success");
  } catch (err) {
    setLinksEditorStatus("儲存失敗：" + err.message, "error");
  }
}

async function resetOncallLinksToDefault() {
  if (!confirm("確定要清除線上入口，還原成部署內建預設值嗎？")) {
    return;
  }

  const token = getResetToken("請輸入入口管理 Token");
  if (!token) {
    setLinksEditorStatus("未輸入入口管理 Token。", "error");
    return;
  }

  try {
    setLinksEditorStatus("正在還原預設入口...", "pending");
    const res = await fetch("/api/oncall-links", {
      method: "DELETE",
      cache: "no-store",
      headers: {
        "x-reset-token": token,
      },
    });
    const data = await readJsonResponse(res);

    if (!res.ok) {
      if (res.status === 403) {
        sessionStorage.removeItem("reset_token");
      }

      throw new Error(data.error || "Reset on-call links failed");
    }

    renderOncallLinks(data);
    document.getElementById("linksEditorText").value = formatOncallConfigForEditor(data);
    setLinksEditorStatus("已還原為預設入口。", "success");
  } catch (err) {
    setLinksEditorStatus("還原失敗：" + err.message, "error");
  }
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
initTheme();
loadLocalWeather();
loadOncallLinks();
trackView();
loadCount();
setInterval(loadStats, 30000);
setInterval(loadLocalWeather, 10 * 60 * 1000);
