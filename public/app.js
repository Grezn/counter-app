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

function getResetToken() {
  // sessionStorage 只在目前分頁保存。
  // 關掉分頁後 token 會消失，比放 localStorage 安全一點。
  let token = sessionStorage.getItem("reset_token");

  if (!token) {
    // Reset 是高風險操作，所以 token 由使用者輸入，不寫死在 HTML 裡。
    token = prompt("請輸入 Reset Token");

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

function loadIncidentState() {
  try {
    const raw = localStorage.getItem(INCIDENT_STORAGE_KEY);
    if (!raw) return;

    const state = JSON.parse(raw);
    const savedFields = state.fields || {};

    getIncidentFields().forEach((field) => {
      field.value = Object.prototype.hasOwnProperty.call(savedFields, field.dataset.incidentField)
        ? savedFields[field.dataset.incidentField]
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

const PERSONAL_LINKS_KEY = "noc_personal_links";

function getPersonalLinksInput() {
  return document.getElementById("personalLinksInput");
}

function loadPersonalLinks() {
  const input = getPersonalLinksInput();
  if (!input) return;

  input.value = localStorage.getItem(PERSONAL_LINKS_KEY) || "";
}

function savePersonalLinks() {
  const input = getPersonalLinksInput();
  if (!input) return;

  localStorage.setItem(PERSONAL_LINKS_KEY, input.value.trim());
  alert("已儲存到這台瀏覽器");
}

function clearPersonalLinks() {
  if (!confirm("確定要清空這台瀏覽器的個人連結嗎？")) {
    return;
  }

  localStorage.removeItem(PERSONAL_LINKS_KEY);
  const input = getPersonalLinksInput();
  if (input) {
    input.value = "";
  }
}

function parsePersonalLinkLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.includes("|")
    ? trimmed.split("|")
    : [trimmed];
  const rawUrl = (parts.length > 1 ? parts.slice(1).join("|") : parts[0]).trim();

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch (err) {
    return null;
  }
}

function openPersonalLinks() {
  const input = getPersonalLinksInput();
  const links = (input ? input.value : "")
    .split(/\r?\n/)
    .map(parsePersonalLinkLine)
    .filter(Boolean);

  if (!links.length) {
    alert("尚未設定可開啟的 HTTPS 連結");
    return;
  }

  links.forEach((url, idx) => {
    setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), idx * 120);
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
// 3. loadPersonalLinks() 載入這台瀏覽器自己的快速連結
// 4. 每 30 秒 loadStats() 更新統計
initIncidentPanel();
loadPersonalLinks();
trackView();
loadCount();
setInterval(loadStats, 30000);
