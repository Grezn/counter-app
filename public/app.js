// 這個檔案是前端互動邏輯。
// 它暫時橋接仍未完全 Vue 化的後端 API，例如 /api/incidents、/api/jira。

function setError(message) {
  // 橋接 API 不可用時不要打斷值班作業；需要排查時仍可看 console。
  if (message) {
    console.warn(message);
  }
}

function clearError() {
  // 保留給既有流程呼叫；目前不顯示全域錯誤框。
}

function legacySetTheme(theme) {
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

function initLegacyTheme() {
  let savedTheme = "";

  try {
    savedTheme = localStorage.getItem("msp_theme") || "";
  } catch {
    savedTheme = "";
  }

  legacySetTheme(savedTheme || document.documentElement.dataset.theme || "light");
}

const LEGACY_VIEW_CONFIG = {
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

function getLegacyViewFromHash() {
  const hash = window.location.hash.replace("#", "").toLowerCase();
  if (hash === "sop" || hash === "runbooks" || hash === "runbook") return "runbooks";
  return "dashboard";
}

function legacySetActiveView(viewName, options = {}) {
  const activeViewName = LEGACY_VIEW_CONFIG[viewName] ? viewName : "dashboard";

  Object.entries(LEGACY_VIEW_CONFIG).forEach(([name, config]) => {
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
    const hash = LEGACY_VIEW_CONFIG[activeViewName].hash;
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

function initLegacyViewTabs() {
  legacySetActiveView(getLegacyViewFromHash(), {
    updateHash: false,
    scrollTop: false,
  });

  window.addEventListener("hashchange", () => {
    legacySetActiveView(getLegacyViewFromHash(), {
      updateHash: false,
      scrollTop: true,
    });
  });

  window.addEventListener("popstate", () => {
    legacySetActiveView(getLegacyViewFromHash(), {
      updateHash: false,
      scrollTop: true,
    });
  });
}

function initLegacyShellFallback() {
  if (window.__mspAppShell) return;

  window.setTheme = legacySetTheme;
  window.setActiveView = legacySetActiveView;
  initLegacyTheme();
  initLegacyViewTabs();
}

function activateAppView(viewName, options = {}) {
  if (window.__mspAppShell && typeof window.__mspAppShell.setActiveView === "function") {
    window.__mspAppShell.setActiveView(viewName, options);
    return;
  }

  if (typeof window.setActiveView === "function") {
    window.setActiveView(viewName, options);
    return;
  }

  legacySetActiveView(viewName, options);
}

const INCIDENT_STORAGE_KEY = "noc_incident_state";
const INCIDENT_ACTIVE_RECORD_STORAGE_KEY = "noc_incident_active_record_id";
const INCIDENT_LOCAL_RECORDS_STORAGE_KEY = "noc_incident_records_local";
const INCIDENT_CORE_FIELD_NAMES = [
  "startedAt",
  "severity",
  "status",
  "customer",
  "system",
  "source",
  "title",
  "problemDescription",
  "impact",
  "handoverOwner",
  "nextStep",
  "notified",
];
const INCIDENT_SERVICE_DETAIL_FIELD_NAMES = [
  "serviceTypeOther",
  "productName",
  "contractId",
  "serial",
  "model",
  "dealer",
  "repairTarget",
  "owner",
  "contactMethod",
  "followupOther",
  "extraInfo",
];
const INCIDENT_SERVICE_DETAIL_FIELD_NAME_SET = new Set(INCIDENT_SERVICE_DETAIL_FIELD_NAMES);
const HANDOVER_SUMMARY_REQUIRED_FIELDS = [
  { field: "startedAt", label: "進線時間", elementId: "incidentStartedAt" },
  { field: "dealer", label: "經銷商", elementId: "incidentDealer" },
  { field: "customer", label: "客戶名稱", elementId: "incidentCustomer" },
  { field: "problemDescription", label: "問題描述", elementId: "incidentProblemDescription" },
  { field: "model", label: "產品型號", elementId: "incidentModel" },
  { field: "serial", label: "產品序號", elementId: "incidentSerial" },
  { field: "owner", label: "負責業務", elementId: "incidentOwner" },
  { field: "contactMethod", label: "聯繫方式", elementId: "incidentContactMethod" },
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

function getIncidentPhraseGroups() {
  return Object.entries(INCIDENT_PHRASE_GROUPS).map(([name, group]) => ({
    name,
    fieldId: group.fieldId,
    menuId: group.menuId,
    phrases: group.phrases || [],
  }));
}
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
  repair: "產品報修主要資訊已放在上方；這裡只補產品分類、合約與後續處理。",
  aws: "AWS 邀請組織可補產品分類；帳號、組織或特殊需求可寫在其他補充。",
  other: "其他類型只保留後續處理與補充欄位，需要的背景請寫在其他補充。",
  empty: "選擇服務類型後，下方只會顯示相關補充欄位。",
};
const HANDOVER_SUMMARY_MODES = {
  full: "完整",
  compact: "精簡",
  update: "更新",
};
let incidentRecordsCache = [];
let activeIncidentRecordId = "";
let activeIncidentSavedSnapshotFallback = null;
let incidentSaveButtonLoading = false;
let incidentHistoryView = "open";
let handoverSummaryMode = "full";
const handoverReadinessActions = new Map();
const handoverSummaryStatusActions = new Map();
let handoverSummaryStatusState = {
  fields: [],
  message: "",
  type: "",
};
let jiraStatusState = {
  linkUrl: "",
  message: "",
  type: "",
};
let incidentHistoryStatusState = {
  message: "",
  type: "",
};
const duplicateIncidentActions = new Map();
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

function readIncidentCoreFieldStateFromPage() {
  return INCIDENT_CORE_FIELD_NAMES.reduce((fields, fieldName) => {
    const field = getIncidentFieldByName(fieldName);
    fields[fieldName] = field ? field.value : "";
    return fields;
  }, {});
}

function readIncidentCoreFieldStateFromBridge() {
  if (window.__mspIncidentCoreFields && typeof window.__mspIncidentCoreFields.getFields === "function") {
    return window.__mspIncidentCoreFields.getFields();
  }

  return null;
}

function syncIncidentCoreFieldsBridge(fields = readIncidentCoreFieldStateFromPage()) {
  if (window.__mspIncidentCoreFields && typeof window.__mspIncidentCoreFields.syncFields === "function") {
    window.__mspIncidentCoreFields.syncFields(fields);
    return true;
  }

  return false;
}

function refreshIncidentCoreFieldState() {
  syncIncidentCoreFieldsBridge(readIncidentCoreFieldStateFromPage());
}

function getIncidentChecks() {
  return Array.from(document.querySelectorAll("[data-incident-check]"));
}

function readIncidentCheckStateFromPage() {
  const checks = {};

  getIncidentChecks().forEach((check) => {
    checks[check.dataset.incidentCheck] = check.checked;
  });

  return checks;
}

function readIncidentCheckStateFromBridge() {
  if (window.__mspIncidentChecklist && typeof window.__mspIncidentChecklist.getChecks === "function") {
    return window.__mspIncidentChecklist.getChecks();
  }

  return null;
}

function syncIncidentChecklistBridge(checks = readIncidentCheckStateFromPage()) {
  if (window.__mspIncidentChecklist && typeof window.__mspIncidentChecklist.syncChecks === "function") {
    window.__mspIncidentChecklist.syncChecks(checks);
    return true;
  }

  return false;
}

function refreshIncidentChecklistState() {
  syncIncidentChecklistBridge(readIncidentCheckStateFromPage());
}

function getIncidentRadios() {
  // radio 是單選題：同一組 name 只會有一個被選到。
  return Array.from(document.querySelectorAll("[data-incident-radio]"));
}

function getIncidentFollowups() {
  // 後續處理方式是複選題，所以每一個 checkbox 都要各自記錄。
  return Array.from(document.querySelectorAll("[data-incident-followup]"));
}

function readIncidentFollowupStateFromPage() {
  const followups = {};

  getIncidentFollowups().forEach((followup) => {
    followups[followup.dataset.incidentFollowup] = followup.checked;
  });

  return followups;
}

function getIncidentServiceDetailFields() {
  return getIncidentFields().filter((field) => (
    field.dataset && INCIDENT_SERVICE_DETAIL_FIELD_NAME_SET.has(field.dataset.incidentField)
  ));
}

function readIncidentServiceDetailFieldStateFromPage() {
  const fields = {};

  getIncidentServiceDetailFields().forEach((field) => {
    fields[field.dataset.incidentField] = field.value;
  });

  return fields;
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

function getIncidentServiceDetailsState() {
  const otherFollowup = document.querySelector('[data-incident-followup="其他"]');
  return {
    fields: readIncidentServiceDetailFieldStateFromPage(),
    followups: readIncidentFollowupStateFromPage(),
    isCustomer: getSelectedIncidentRadioValue("isCustomer"),
    otherFollowup: Boolean(otherFollowup && otherFollowup.checked),
    serviceType: getSelectedIncidentRadioValue("serviceType"),
  };
}

function readIncidentServiceDetailsStateFromBridge() {
  if (
    window.__mspIncidentServiceDetails
    && typeof window.__mspIncidentServiceDetails.getState === "function"
  ) {
    return window.__mspIncidentServiceDetails.getState();
  }

  return null;
}

function readIncidentStateFromBridge() {
  if (window.__mspIncidentState && typeof window.__mspIncidentState.getState === "function") {
    return window.__mspIncidentState.getState();
  }

  return null;
}

function loadIncidentStateFromBridge() {
  if (window.__mspIncidentState && typeof window.__mspIncidentState.loadState === "function") {
    return window.__mspIncidentState.loadState();
  }

  return null;
}

function saveIncidentStateToBridge(state) {
  if (window.__mspIncidentState && typeof window.__mspIncidentState.saveState === "function") {
    window.__mspIncidentState.saveState(state);
    return true;
  }

  return false;
}

function clearIncidentStateInBridge() {
  if (window.__mspIncidentState && typeof window.__mspIncidentState.clearState === "function") {
    window.__mspIncidentState.clearState();
    return true;
  }

  return false;
}

function applyIncidentStateToBridge(state) {
  if (window.__mspIncidentState && typeof window.__mspIncidentState.applyState === "function") {
    window.__mspIncidentState.applyState(state);
    return true;
  }

  return false;
}

function patchIncidentFieldsInBridge(fields = {}) {
  if (!window.__mspIncidentState || typeof window.__mspIncidentState.applyState !== "function") {
    return false;
  }

  const currentState = readIncidentStateFromPage();
  window.__mspIncidentState.applyState({
    ...currentState,
    fields: {
      ...(currentState.fields || {}),
      ...fields,
    },
  });
  return true;
}

function patchIncidentRadiosInBridge(radios = {}) {
  if (!window.__mspIncidentState || typeof window.__mspIncidentState.applyState !== "function") {
    return false;
  }

  const currentState = readIncidentStateFromPage();
  window.__mspIncidentState.applyState({
    ...currentState,
    radios: {
      ...(currentState.radios || {}),
      ...radios,
    },
  });
  return true;
}

function patchIncidentFollowupsInBridge(followups = {}) {
  if (!window.__mspIncidentState || typeof window.__mspIncidentState.applyState !== "function") {
    return false;
  }

  const currentState = readIncidentStateFromPage();
  window.__mspIncidentState.applyState({
    ...currentState,
    followups: {
      ...(currentState.followups || {}),
      ...followups,
    },
  });
  return true;
}

function updateServiceTypeFieldVisibility() {
  if (window.__mspIncidentServiceDetails && typeof window.__mspIncidentServiceDetails.syncState === "function") {
    window.__mspIncidentServiceDetails.syncState(getIncidentServiceDetailsState());
    return;
  }

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
  const bridgedState = readIncidentStateFromBridge();
  if (bridgedState) {
    return bridgedState;
  }

  const fields = {};
  const radios = {};
  const serviceDetails = readIncidentServiceDetailsStateFromBridge();
  const nextCheck = readIncidentNextCheckStateFromBridge();
  const notes = readIncidentNotesValueFromBridge();

  getIncidentFields().forEach((field) => {
    fields[field.dataset.incidentField] = field.value;
  });

  Object.assign(fields, readIncidentCoreFieldStateFromBridge() || {});

  if (nextCheck) {
    fields.nextCheckAt = nextCheck.nextCheckAt || "";
    fields.trackingStatus = nextCheck.trackingStatus || "";
  }

  if (notes !== null) {
    fields.notes = notes;
  }

  if (serviceDetails && serviceDetails.fields) {
    Object.assign(fields, serviceDetails.fields);
  }

  getIncidentRadios().forEach((radio) => {
    if (radio.checked) {
      radios[radio.dataset.incidentRadio] = radio.value;
    }
  });

  if (serviceDetails && serviceDetails.isCustomer) {
    radios.isCustomer = serviceDetails.isCustomer;
  }

  if (serviceDetails && serviceDetails.serviceType) {
    radios.serviceType = serviceDetails.serviceType;
  }

  return {
    fields,
    checks: readIncidentCheckStateFromBridge() || readIncidentCheckStateFromPage(),
    radios,
    followups: serviceDetails && serviceDetails.followups
      ? serviceDetails.followups
      : readIncidentFollowupStateFromPage(),
  };
}

function saveIncidentState() {
  // 值班事件是個人暫存資料，所以存在 localStorage。
  // 重新整理網頁後資料還在，但不會送到 server 或 Redis。
  try {
    const state = readIncidentStateFromPage();
    if (saveIncidentStateToBridge(state)) return;

    localStorage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    setError("事件暫存失敗：" + err.message);
  }
}

function getIncidentSaveStatusBridge() {
  return window.__mspIncidentSaveStatus || null;
}

function setActiveIncidentRecordIdInBridge(id) {
  const bridge = getIncidentSaveStatusBridge();
  if (bridge && typeof bridge.setActiveRecordId === "function") {
    bridge.setActiveRecordId(id);
    return true;
  }

  return false;
}

function loadActiveIncidentRecordIdFromBridge() {
  const bridge = getIncidentSaveStatusBridge();
  if (bridge && typeof bridge.loadActiveRecordId === "function") {
    return String(bridge.loadActiveRecordId() || "");
  }

  if (bridge && typeof bridge.getActiveRecordId === "function") {
    return String(bridge.getActiveRecordId() || "");
  }

  return null;
}

function setActiveIncidentSavedSnapshotInBridge(snapshot) {
  const bridge = getIncidentSaveStatusBridge();
  if (bridge && typeof bridge.setSavedSnapshot === "function") {
    bridge.setSavedSnapshot(snapshot);
    return true;
  }

  return false;
}

function clearActiveIncidentSavedSnapshotInBridge() {
  const bridge = getIncidentSaveStatusBridge();
  if (bridge && typeof bridge.clearSavedSnapshot === "function") {
    bridge.clearSavedSnapshot();
    return true;
  }

  return false;
}

function getActiveIncidentSavedSnapshotFromBridge() {
  const bridge = getIncidentSaveStatusBridge();
  if (bridge && typeof bridge.getSavedSnapshot === "function") {
    return bridge.getSavedSnapshot() || null;
  }

  return undefined;
}

function syncIncidentSaveStatusBridge() {
  const bridge = getIncidentSaveStatusBridge();
  if (bridge && typeof bridge.syncState === "function") {
    bridge.syncState({
      activeRecordId: activeIncidentRecordId,
      hasActiveRecord: Boolean(activeIncidentRecordId),
      isSaving: incidentSaveButtonLoading,
      savedSnapshot: activeIncidentSavedSnapshotFallback,
    });
    return true;
  }

  return false;
}

function updateSaveIncidentButtonLabel() {
  if (syncIncidentSaveStatusBridge()) return;

  const button = document.getElementById("saveIncidentButton");
  if (!button || button.disabled) return;

  button.textContent = activeIncidentRecordId ? "更新" : "儲存";
}

function setActiveIncidentRecordId(id) {
  const nextActiveId = String(id || "");
  if (nextActiveId !== activeIncidentRecordId) {
    clearActiveIncidentSavedSnapshot();
  }
  activeIncidentRecordId = nextActiveId;

  if (!setActiveIncidentRecordIdInBridge(activeIncidentRecordId)) {
    try {
      if (activeIncidentRecordId) {
        localStorage.setItem(INCIDENT_ACTIVE_RECORD_STORAGE_KEY, activeIncidentRecordId);
      } else {
        localStorage.removeItem(INCIDENT_ACTIVE_RECORD_STORAGE_KEY);
      }
    } catch {
      // 無法寫入 localStorage 時仍允許本次編輯使用記憶體狀態。
    }
  }

  updateSaveIncidentButtonLabel();
}

function loadActiveIncidentRecordId() {
  const previousActiveId = activeIncidentRecordId;
  const bridgedId = loadActiveIncidentRecordIdFromBridge();
  if (bridgedId !== null) {
    activeIncidentRecordId = bridgedId;
  } else {
    try {
      activeIncidentRecordId = localStorage.getItem(INCIDENT_ACTIVE_RECORD_STORAGE_KEY) || "";
    } catch {
      activeIncidentRecordId = "";
    }
  }

  if (activeIncidentRecordId !== previousActiveId) {
    clearActiveIncidentSavedSnapshot();
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
  activeIncidentSavedSnapshotFallback = record && record.incident
    ? normalizeComparableIncidentState(record.incident)
    : null;
  setActiveIncidentSavedSnapshotInBridge(activeIncidentSavedSnapshotFallback);
}

function clearActiveIncidentSavedSnapshot() {
  activeIncidentSavedSnapshotFallback = null;
  clearActiveIncidentSavedSnapshotInBridge();
}

function getActiveIncidentSavedSnapshot() {
  const bridgedSnapshot = getActiveIncidentSavedSnapshotFromBridge();
  if (bridgedSnapshot !== undefined) return bridgedSnapshot;

  return activeIncidentSavedSnapshotFallback;
}

function getActiveIncidentRecord() {
  if (!activeIncidentRecordId) return null;
  return incidentRecordsCache.find((record) => record.id === activeIncidentRecordId) || null;
}

function hasCurrentIncidentUnsavedChanges(state = readIncidentStateFromPage()) {
  if (!hasIncidentContent(state)) return false;

  const currentSnapshot = normalizeComparableIncidentState(state);
  const cachedRecord = getActiveIncidentRecord();
  const savedSnapshot = getActiveIncidentSavedSnapshot()
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

function getIncidentTemplateOptions() {
  return INCIDENT_TEMPLATES.map((template) => ({
    id: template.id,
    label: template.label,
  }));
}

function updateIncidentTemplateApplyState() {
  if (window.__mspIncidentTemplates && typeof window.__mspIncidentTemplates.syncTemplates === "function") {
    window.__mspIncidentTemplates.syncTemplates(getIncidentTemplateOptions());
  }
}

function initIncidentTemplates() {
  if (window.__mspIncidentTemplates && typeof window.__mspIncidentTemplates.syncTemplates === "function") {
    window.__mspIncidentTemplates.syncTemplates(getIncidentTemplateOptions());
  }
}

function applyIncidentTemplateField(fieldName, value) {
  const field = getIncidentFieldByName(fieldName);
  const currentState = readIncidentStateFromPage();
  const currentValue = currentState && currentState.fields
    ? currentState.fields[fieldName]
    : (field && field.value);
  if (String(currentValue || "").trim()) return false;

  const normalizedValue = normalizeIncidentFieldValue(fieldName, value);
  if (!String(normalizedValue || "").trim()) return false;

  if (patchIncidentFieldsInBridge({ [fieldName]: normalizedValue })) {
    if (field) {
      field.value = normalizedValue;
    }
    return true;
  }

  if (!field) return false;

  field.value = normalizedValue;
  return Boolean(String(field.value || "").trim());
}

function applyIncidentTemplateRadio(radioName, value) {
  const currentState = readIncidentStateFromPage();
  const currentValue = currentState && currentState.radios
    ? currentState.radios[radioName]
    : getSelectedIncidentRadioValue(radioName);
  if (String(currentValue || "").trim()) return false;

  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return false;

  const radio = getIncidentRadios().find((item) => (
    item.dataset.incidentRadio === radioName && item.value === normalizedValue
  ));
  if (!radio) return false;

  if (patchIncidentRadiosInBridge({ [radioName]: normalizedValue })) {
    radio.checked = true;
    return true;
  }

  radio.checked = true;
  return true;
}

function applyIncidentTemplateFollowup(followupName, value) {
  const nextValue = Boolean(value);
  const currentState = readIncidentStateFromPage();
  const followup = getIncidentFollowups().find((item) => item.dataset.incidentFollowup === followupName);
  const currentValue = currentState && currentState.followups
    && Object.prototype.hasOwnProperty.call(currentState.followups, followupName)
    ? Boolean(currentState.followups[followupName])
    : Boolean(followup && followup.checked);

  if (!followup || currentValue === nextValue) return false;

  if (patchIncidentFollowupsInBridge({ [followupName]: nextValue })) {
    followup.checked = nextValue;
    return true;
  }

  followup.checked = nextValue;
  return true;
}

function applySelectedIncidentTemplate(templateId = "") {
  const select = document.getElementById("incidentTemplateSelect");
  const selectedTemplateId = String(templateId || (select && select.value) || "").trim();
  const template = getIncidentTemplateById(selectedTemplateId);
  if (!template) return;

  const appliedFields = Object.entries(template.fields || {})
    .filter(([fieldName, value]) => applyIncidentTemplateField(fieldName, value)).length;
  const appliedRadios = Object.entries(template.radios || {})
    .filter(([radioName, value]) => applyIncidentTemplateRadio(radioName, value)).length;
  const appliedFollowups = Object.entries(template.followups || {})
    .filter(([followupName, value]) => applyIncidentTemplateFollowup(followupName, value)).length;
  const appliedCount = appliedFields + appliedRadios + appliedFollowups;

  syncIncidentCoreFieldsBridge();
  renderIncidentNotesTimeline();
  updateIncidentNextCheckAvailability();
  updateServiceTypeFieldVisibility();
  saveIncidentState();
  updateHandoverSummary();

  if (select && !templateId) {
    select.value = "";
  }
  updateIncidentTemplateApplyState();

  setHandoverSummaryStatus(
    appliedCount
      ? `已套用事件樣板：${template.label}`
      : "目前欄位已有內容；樣板未覆蓋任何欄位。",
    appliedCount ? "success" : "pending",
  );
}

function getQuickIncidentInputText(text) {
  if (arguments.length > 0) {
    return String(text || "").trim();
  }

  const input = document.getElementById("incidentQuickIntake");
  return input ? String(input.value || "").trim() : "";
}

function clearQuickIncidentInput() {
  if (window.__mspIncidentQuickIntake && typeof window.__mspIncidentQuickIntake.syncText === "function") {
    window.__mspIncidentQuickIntake.syncText("");
    setHandoverSummaryStatus("");
    return;
  }

  const input = document.getElementById("incidentQuickIntake");
  if (input) input.value = "";
  setHandoverSummaryStatus("");
}

function compactQuickIncidentText(value, maxLength = 1600) {
  const text = String(value || "").replace(/\r\n/g, "\n").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function compactQuickIncidentLine(value, maxLength = 96) {
  const line = String(value || "").replace(/\s+/g, " ").trim();
  if (line.length <= maxLength) return line;
  return `${line.slice(0, maxLength - 1)}…`;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getQuickIncidentTaggedValue(text, labels) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const pattern = new RegExp(`(?:^|[\\n\\r])\\s*(?:${labelPattern})\\s*[:：]\\s*([^\\n\\r]+)`, "i");
  const match = String(text || "").match(pattern);
  return match ? compactQuickIncidentLine(match[1]) : "";
}

function getQuickIncidentReporter(text) {
  const match = String(text || "").match(/接到來自(.+?)的報修電話/i);
  return match ? compactQuickIncidentLine(match[1]) : "";
}

function getQuickIncidentFirstMeaningfulLine(text) {
  const taggedTitle = getQuickIncidentTaggedValue(text, ["Subject", "主旨", "標題", "Title", "Issue", "事件"]);
  if (taggedTitle) return taggedTitle;

  const ignoredHeaderPattern = /^(from|to|cc|bcc|date|sent|寄件者|收件者|副本|日期|時間)\s*[:：]/i;
  return String(text || "")
    .split(/\n+/)
    .map(compactQuickIncidentLine)
    .find((line) => line && !ignoredHeaderPattern.test(line)) || "新事件待確認";
}

function inferQuickIncidentSource(text) {
  const value = String(text || "");
  if (/jira|issue\s*[A-Z]+-\d+|ticket/i.test(value)) return "Jira";
  if (/line|官方\s*line/i.test(value)) return "LINE";
  if (/phone|call|電話|來電|撥打/i.test(value)) return "Phone";
  if (/aws|cloudwatch|guardduty|health event|aws health/i.test(value)) return "AWS";
  if (/mail|email|outlook|subject|寄件者|來信|信件/i.test(value)) return "Email";
  if (/customer|客戶/i.test(value)) return "Customer";
  return "";
}

function inferQuickIncidentSeverity(text) {
  const value = String(text || "");

  if (/critical|panic|fatal|sev\s*1|p1|outage|down|重大|當機|中斷|不可用|無法使用|無法連線|服務影響/i.test(value)) {
    return "Service Impact / 服務影響";
  }

  if (/resolved|recovered|恢復|已恢復|正常|可結案/i.test(value)) {
    return "Info / 資訊";
  }

  if (/warning|alert|alarm|failed|failure|error|threshold|告警|異常|失敗|錯誤|超過|高於/i.test(value)) {
    return "Warning / 警告";
  }

  return "Warning / 警告";
}

function inferQuickIncidentTrackingStatus(text) {
  const value = String(text || "");
  if (/resolved|recovered|恢復|已恢復|正常|可結案/i.test(value)) return "可結案";
  if (/waiting|pending|待回覆|等.*回覆/i.test(value)) return "等客戶回覆";
  if (/monitor|觀察|監控/i.test(value)) return "持續監控";
  return "需追蹤";
}

function inferQuickIncidentSystem(text) {
  const taggedSystem = getQuickIncidentTaggedValue(text, [
    "系統",
    "設備",
    "主機",
    "服務",
    "資源",
    "System",
    "Host",
    "Service",
    "Instance",
  ]);
  if (taggedSystem) return taggedSystem;

  const value = String(text || "");
  const products = ["MinIO", "AWS", "VPN", "Dell", "PureStorage", "Akamai", "CyCraft", "Xensor", "CloudWatch"];
  return products.find((product) => new RegExp(escapeRegExp(product), "i").test(value)) || "";
}

function buildQuickIncidentDraft(text) {
  const source = inferQuickIncidentSource(text);
  const severity = inferQuickIncidentSeverity(text);
  const trackingStatus = inferQuickIncidentTrackingStatus(text);
  const customer = getQuickIncidentTaggedValue(text, ["客戶", "客戶名稱", "Customer", "公司", "單位"]);
  const problemDescription = getQuickIncidentTaggedValue(text, ["問題描述", "問題內容", "Description", "Problem"])
    || compactQuickIncidentText(text);
  const dealer = getQuickIncidentTaggedValue(text, ["經銷商", "經銷商名稱", "Dealer", "SI"]);
  const model = getQuickIncidentTaggedValue(text, ["產品型號", "型號", "Model"]);
  const serial = getQuickIncidentTaggedValue(text, ["產品序號", "序號", "Serial", "S/N", "SN"]);
  const owner = getQuickIncidentTaggedValue(text, ["負責業務", "業務", "Owner", "Sales"]);
  const contactMethod = getQuickIncidentTaggedValue(text, ["聯繫方式", "聯絡方式", "聯絡資訊", "電話", "Email", "Mail", "Contact"]);
  const repairTarget = getQuickIncidentReporter(text);
  const title = customer && problemDescription
    ? `${customer} - ${compactQuickIncidentLine(problemDescription, 72)}`
    : getQuickIncidentFirstMeaningfulLine(text);
  const system = inferQuickIncidentSystem(text);
  const isServiceImpact = severity === "Service Impact / 服務影響";
  const noteTitle = compactQuickIncidentLine(title, 120);

  return {
    startedAt: formatLocalDateTime(new Date()),
    dealer,
    repairTarget,
    model,
    serial,
    owner,
    contactMethod,
    severity,
    status: trackingStatus === "可結案" ? "Monitoring / 監控中" : "Triage / 初步判斷",
    source,
    customer,
    system,
    title: noteTitle,
    problemDescription,
    impact: isServiceImpact
      ? "可能影響服務可用性，需先確認影響範圍、受影響對象與 workaround。"
      : "待確認是否影響服務、影響範圍與是否需要通知相關窗口。",
    nextStep: "先確認告警來源、影響範圍與嚴重度；必要時通知二線或窗口協助處理。",
    trackingStatus,
    notes: `${formatLocalTimeMinute()} 收到通報：${noteTitle}`,
  };
}

function applyQuickIncidentDraft(inputText) {
  const text = getQuickIncidentInputText(inputText);
  if (!text) {
    setHandoverSummaryStatus("先貼上告警、客戶訊息或 Jira 摘要。", "pending");
    return;
  }

  const hadDraftContent = hasIncidentContent(readIncidentStateFromPage());
  const draft = buildQuickIncidentDraft(text);
  const appliedFields = Object.entries(draft)
    .filter(([, value]) => String(value || "").trim())
    .filter(([fieldName, value]) => applyIncidentTemplateField(fieldName, value)).length;
  const appliedChecklist = markIncidentCheck("確認告警時間與來源") ? 1 : 0;
  const appliedCount = appliedFields + appliedChecklist;

  syncIncidentCoreFieldsBridge();
  renderIncidentNotesTimeline();
  updateIncidentNextCheckAvailability();
  updateServiceTypeFieldVisibility();
  saveIncidentState();
  updateHandoverSummary();

  const firstDraftField = document.getElementById("incidentProblemDescription")
    || document.getElementById("incidentCustomer")
    || document.getElementById("incidentTitle");
  if (firstDraftField) {
    firstDraftField.scrollIntoView({ block: "center", behavior: "smooth" });
    firstDraftField.focus();
  }

  setHandoverSummaryStatus(
    appliedCount
      ? (hadDraftContent ? "已補入快速接案內容，不覆蓋既有欄位。" : "已從快速接案建立事件草稿。")
      : "目前事件欄位已有內容；快速接案未覆蓋既有草稿。",
    appliedCount ? "success" : "pending",
  );
}

function appendQuickIntakeToIncidentNotes(inputText) {
  const text = getQuickIncidentInputText(inputText);
  const field = getIncidentFieldByName("notes");
  if (!text || !field) {
    setHandoverSummaryStatus("先貼上要追加的處理紀錄。", "pending");
    return;
  }

  const title = getQuickIncidentFirstMeaningfulLine(text);
  const detail = compactQuickIncidentText(text, 900);
  const note = detail === title
    ? `${formatLocalTimeMinute()} ${title}`
    : `${formatLocalTimeMinute()} ${title}\n${detail}`;

  insertTextAtFieldEnd(field, note);
  renderIncidentNotesTimeline();
  saveIncidentState();
  updateHandoverSummary();
  setHandoverSummaryStatus("已追加快速接案內容到處理紀錄。", "success");
}

function loadIncidentState() {
  try {
    const bridgedState = loadIncidentStateFromBridge();
    if (bridgedState) {
      applyIncidentStateToPage(bridgedState);
      return;
    }

    const raw = localStorage.getItem(INCIDENT_STORAGE_KEY);
    if (!raw) return;

    applyIncidentStateToPage(JSON.parse(raw));
  } catch (err) {
    setError("事件暫存讀取失敗：" + err.message);
  }
}

function applyIncidentStateToPage(state) {
  if (applyIncidentStateToBridge(state)) return;

  const savedFields = state && state.fields ? state.fields : {};

  getIncidentFields().forEach((field) => {
    const fieldName = field.dataset.incidentField;
    field.value = Object.prototype.hasOwnProperty.call(savedFields, fieldName)
      ? normalizeIncidentFieldValue(fieldName, savedFields[fieldName])
      : "";
  });
  syncIncidentCoreFieldsBridge();
  renderIncidentNotesTimeline(state);

  getIncidentChecks().forEach((check) => {
    check.checked = Boolean(state && state.checks && state.checks[check.dataset.incidentCheck]);
  });
  syncIncidentChecklistBridge(state && state.checks ? state.checks : {});

  getIncidentRadios().forEach((radio) => {
    radio.checked = Boolean(state && state.radios && state.radios[radio.dataset.incidentRadio] === radio.value);
  });

  getIncidentFollowups().forEach((followup) => {
    followup.checked = Boolean(state && state.followups && state.followups[followup.dataset.incidentFollowup]);
  });

  updateIncidentNextCheckAvailability();
  updateServiceTypeFieldVisibility();
}

function clearIncidentUiState() {
  if (applyIncidentStateToBridge({})) {
    return true;
  }

  getIncidentFields().forEach((field) => {
    field.value = "";
  });
  syncIncidentCoreFieldsBridge({});
  renderIncidentNotesTimeline({ fields: { notes: "" } });

  getIncidentChecks().forEach((check) => {
    check.checked = false;
  });
  syncIncidentChecklistBridge({});

  getIncidentRadios().forEach((radio) => {
    radio.checked = false;
  });

  getIncidentFollowups().forEach((followup) => {
    followup.checked = false;
  });

  updateIncidentNextCheckAvailability();
  updateServiceTypeFieldVisibility();
  return false;
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

function setIncidentNow(startedAtValue = "") {
  const startedAt = document.getElementById("incidentStartedAt");
  if (!startedAt) return;

  startedAt.value = String(startedAtValue || "").trim() || formatLocalDateTime(new Date());
  syncIncidentCoreFieldsBridge();
  saveIncidentState();
  updateHandoverSummary();
}

function clearIncidentNextCheckAt() {
  const nextCheckAt = document.getElementById("incidentNextCheckAt");
  if (nextCheckAt) nextCheckAt.value = "";
  syncIncidentNextCheckBridge(getIncidentNextCheckState());
  saveIncidentState();
  setHandoverSummaryStatus("");
  updateHandoverSummary();
}

function getIncidentNextCheckState() {
  return {
    nextCheckAt: document.getElementById("incidentNextCheckAt")?.value || "",
    trackingStatus: document.getElementById("incidentTrackingStatus")?.value || "",
  };
}

function readIncidentNextCheckStateFromBridge() {
  if (window.__mspIncidentNextCheck && typeof window.__mspIncidentNextCheck.getState === "function") {
    return window.__mspIncidentNextCheck.getState();
  }

  return null;
}

function syncIncidentNextCheckBridge(nextState = getIncidentNextCheckState()) {
  if (window.__mspIncidentNextCheck && typeof window.__mspIncidentNextCheck.syncState === "function") {
    window.__mspIncidentNextCheck.syncState(nextState);
    return true;
  }

  return false;
}

function updateIncidentNextCheckAvailability() {
  const nextState = getIncidentNextCheckState();
  const shouldDisable = canTrackingStatusSkipNextCheck(nextState.trackingStatus);
  const nextCheckAt = document.getElementById("incidentNextCheckAt");

  if (shouldDisable && nextCheckAt) {
    nextCheckAt.value = "";
    nextState.nextCheckAt = "";
  }

  if (syncIncidentNextCheckBridge(nextState)) {
    return;
  }

  const trackingStatus = document.getElementById("incidentTrackingStatus");
  if (!trackingStatus || !nextCheckAt) return;

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

function syncHandoverSummaryTextBridge(summary) {
  if (window.__mspHandoverSummaryText && typeof window.__mspHandoverSummaryText.syncText === "function") {
    window.__mspHandoverSummaryText.syncText(summary);
    return true;
  }

  return false;
}

function updateHandoverSummaryText() {
  const summary = buildHandoverSummary();

  if (!syncHandoverSummaryTextBridge(summary)) {
    const output = document.getElementById("handoverSummary");
    if (output) {
      output.value = summary;
    }
  }

  return summary;
}

function updateHandoverSummary() {
  const summary = updateHandoverSummaryText();

  updateHandoverSummaryBadge();
  renderIncidentNotesTimeline();
  renderDuplicateIncidentStatus();
  renderHandoverReadiness();

  return summary;
}

function syncHandoverSummaryModeBridge() {
  if (window.__mspHandoverSummaryMode && typeof window.__mspHandoverSummaryMode.syncMode === "function") {
    window.__mspHandoverSummaryMode.syncMode(handoverSummaryMode);
    return true;
  }

  return false;
}

function updateHandoverSummaryModeButtons() {
  syncHandoverSummaryModeBridge();
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
  if (window.__mspIncidentPhrases && typeof window.__mspIncidentPhrases.closeMenus === "function") {
    window.__mspIncidentPhrases.closeMenus();
  }
}

function toggleIncidentPhraseMenu(groupName) {
  if (window.__mspIncidentPhrases && typeof window.__mspIncidentPhrases.syncOpenGroup === "function") {
    window.__mspIncidentPhrases.syncOpenGroup(groupName);
  }
}

function mirrorIncidentFieldDomValue(field, value) {
  field.value = value;
  field.focus();
  field.selectionStart = field.value.length;
  field.selectionEnd = field.value.length;
}

function insertTextAtFieldEnd(field, text) {
  if (!field) return false;

  const fieldName = field.dataset ? field.dataset.incidentField : "";
  const currentState = readIncidentStateFromPage();
  const currentValue = fieldName && currentState && currentState.fields
    ? String(currentState.fields[fieldName] || "")
    : field.value;
  const prefix = currentValue && !currentValue.endsWith("\n") ? "\n" : "";
  const nextValue = `${currentValue}${prefix}${String(text || "")}`;

  if (fieldName && patchIncidentFieldsInBridge({ [fieldName]: nextValue })) {
    mirrorIncidentFieldDomValue(field, nextValue);
    return true;
  }

  mirrorIncidentFieldDomValue(field, nextValue);
  return true;
}

function insertIncidentPhrase(groupName, phrase) {
  const group = INCIDENT_PHRASE_GROUPS[groupName];
  const field = group && document.getElementById(group.fieldId);
  if (!group || !field) return;

  const text = group.withTime ? `${formatLocalTimeMinute()} ${phrase}` : phrase;
  insertTextAtFieldEnd(field, text);
  syncIncidentCoreFieldsBridge();
  if (groupName === "notes") {
    renderIncidentNotesTimeline();
  }
  saveIncidentState();
  setHandoverSummaryStatus("");
  updateHandoverSummary();
  closeIncidentPhraseMenus();
}

function initIncidentPhraseMenus() {
  if (window.__mspIncidentPhrases && typeof window.__mspIncidentPhrases.syncPhraseGroups === "function") {
    window.__mspIncidentPhrases.syncPhraseGroups(getIncidentPhraseGroups());
  }
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

function syncHandoverSummaryStatusBridge() {
  if (window.__mspHandoverSummaryStatus && typeof window.__mspHandoverSummaryStatus.syncState === "function") {
    window.__mspHandoverSummaryStatus.syncState(handoverSummaryStatusState);
    return true;
  }
  return false;
}

function focusHandoverSummaryStatusField(fieldId) {
  const action = handoverSummaryStatusActions.get(fieldId);
  if (typeof action === "function") {
    action();
  }
}

function getHandoverSummaryBadgeState(state = readIncidentStateFromPage()) {
  const missingFields = getMissingHandoverSummaryFields(state);
  const isComplete = missingFields.length === 0;
  return {
    isComplete,
    missingCount: missingFields.length,
    text: isComplete ? "摘要完整" : `缺 ${missingFields.length} 項`,
    title: isComplete
      ? "交班摘要可複製"
      : `尚缺：${missingFields.map((item) => item.label).join("、")}`,
  };
}

function updateHandoverSummaryBadge(state = readIncidentStateFromPage()) {
  const badgeState = getHandoverSummaryBadgeState(state);

  if (window.__mspHandoverSummaryBadge && typeof window.__mspHandoverSummaryBadge.syncState === "function") {
    window.__mspHandoverSummaryBadge.syncState(badgeState);
  }
}

function setHandoverSummaryMissingStatus(missingFields) {
  handoverSummaryStatusActions.clear();
  const fields = (missingFields || []).map((item) => {
    handoverSummaryStatusActions.set(item.field, () => focusHandoverSummaryField(item));
    return {
      id: item.field,
      label: item.label,
    };
  });
  handoverSummaryStatusState = {
    fields,
    message: "",
    type: "error",
  };

  syncHandoverSummaryStatusBridge();
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

  syncIncidentHistoryFilterBridge();
}

function executeHandoverReadinessAction(actionId) {
  const action = handoverReadinessActions.get(actionId);
  if (typeof action === "function") {
    action();
  }
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

function getHandoverReadinessState(state = readIncidentStateFromPage()) {
  const currentHasContent = hasIncidentContent(state);
  const missingSummaryFields = currentHasContent ? getMissingHandoverSummaryFields(state) : [];
  const dueRecords = getOpenIncidentRecords().filter(isIncidentRecordDue);
  const recordsMissingNextStep = getRecordsMissingNextStep();
  const readyToResolveRecords = getOpenIncidentRecords().filter(isIncidentRecordReadyToResolve);
  const staleResolvedRecords = incidentRecordsCache.filter(isIncidentRecordResolved);
  const issues = [];
  handoverReadinessActions.clear();

  const addIssue = (id, label, action) => {
    handoverReadinessActions.set(id, action);
    issues.push({ id, label });
  };

  if (missingSummaryFields.length) {
    addIssue(
      "missing-summary",
      `摘要待補 ${missingSummaryFields.length} 項`,
      () => {
        setHandoverSummaryMissingStatus(missingSummaryFields);
        focusHandoverSummaryField(missingSummaryFields[0]);
      },
    );
  }

  if (hasCurrentIncidentUnsavedChanges(state)) {
    addIssue(
      "save-current-incident",
      activeIncidentRecordId ? "目前事件未更新" : "目前事件未儲存",
      () => saveIncidentRecord(),
    );
  }

  if (dueRecords.length) {
    addIssue(
      "due-records",
      `待確認 ${dueRecords.length} 件`,
      () => {
        clearIncidentHistoryFilters();
        setIncidentHistoryView("open");
        scrollToIncidentHistory();
      },
    );
  }

  if (recordsMissingNextStep.length) {
    addIssue(
      "missing-next-step-records",
      `未填下一步 ${recordsMissingNextStep.length} 件`,
      () => {
        clearIncidentHistoryFilters();
        setIncidentHistoryView("open");
        scrollToIncidentHistory();
      },
    );
  }

  if (readyToResolveRecords.length) {
    addIssue(
      "ready-to-resolve-records",
      `可結案 ${readyToResolveRecords.length} 件`,
      () => {
        clearIncidentHistoryFilters();
        setIncidentHistoryView("open");
        scrollToIncidentHistory();
      },
    );
  }

  if (staleResolvedRecords.length && incidentHistoryView === "open") {
    addIssue(
      "refresh-resolved-records",
      `已解決仍在列表 ${staleResolvedRecords.length} 件`,
      () => loadIncidentRecords({ showLoading: false }),
    );
  }

  const isReady = issues.length === 0;
  return {
    isReady,
    issues,
    label: isReady ? "可交班" : `交班提醒 ${issues.length} 項`,
    message: isReady ? "摘要與未結案事件看起來都完整。" : "這些只是檢查提示，可視情況處理。",
  };
}

function renderHandoverReadiness(state = readIncidentStateFromPage()) {
  const readinessState = getHandoverReadinessState(state);

  if (window.__mspHandoverReadiness && typeof window.__mspHandoverReadiness.syncState === "function") {
    window.__mspHandoverReadiness.syncState(readinessState);
  }
}

function readIncidentNotesValueFromBridge() {
  if (window.__mspIncidentNotesTimeline && typeof window.__mspIncidentNotesTimeline.getNotes === "function") {
    return window.__mspIncidentNotesTimeline.getNotes();
  }

  return null;
}

function readIncidentNotesValueFromPage() {
  const notes = getIncidentFieldByName("notes");
  return notes ? notes.value : "";
}

function renderIncidentNotesTimeline(state) {
  const notes = state && state.fields ? state.fields.notes : readIncidentNotesValueFromPage();

  if (window.__mspIncidentNotesTimeline && typeof window.__mspIncidentNotesTimeline.syncNotes === "function") {
    window.__mspIncidentNotesTimeline.syncNotes(notes);
  }
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

    const summary = updateHandoverSummary();
    await navigator.clipboard.writeText(summary);

    markIncidentCheck("整理交班資訊");
    saveIncidentState();
    updateHandoverSummary();
    setHandoverSummaryStatus(`已複製${HANDOVER_SUMMARY_MODES[handoverSummaryMode]}交班摘要。`, "success");
  } catch (err) {
    setHandoverSummaryStatus("交班摘要複製失敗：" + err.message, "error");
  }
}

function setJiraStatus(message, type, linkUrl) {
  jiraStatusState = {
    linkUrl: linkUrl || "",
    message: message || "",
    type: type || "",
  };

  if (window.__mspJiraStatus && typeof window.__mspJiraStatus.syncState === "function") {
    window.__mspJiraStatus.syncState(jiraStatusState);
  }
}

function refreshJiraStatus() {
  if (window.__mspJiraStatus && typeof window.__mspJiraStatus.syncState === "function") {
    window.__mspJiraStatus.syncState(jiraStatusState);
  }
}

function setIncidentHistoryStatus(message, type) {
  incidentHistoryStatusState = {
    message: message || "",
    type: type || "",
  };

  if (window.__mspIncidentHistoryStatus && typeof window.__mspIncidentHistoryStatus.syncState === "function") {
    window.__mspIncidentHistoryStatus.syncState(incidentHistoryStatusState);
  }
}

function refreshIncidentHistoryStatus() {
  if (window.__mspIncidentHistoryStatus && typeof window.__mspIncidentHistoryStatus.syncState === "function") {
    window.__mspIncidentHistoryStatus.syncState(incidentHistoryStatusState);
  }
}

function setHandoverSummaryStatus(message, type) {
  handoverSummaryStatusActions.clear();
  handoverSummaryStatusState = {
    fields: [],
    message: message || "",
    type: type || "",
  };

  syncHandoverSummaryStatusBridge();
}

function setSaveIncidentButtonLoading(isLoading) {
  incidentSaveButtonLoading = Boolean(isLoading);

  if (syncIncidentSaveStatusBridge()) return;

  const button = document.getElementById("saveIncidentButton");
  if (!button) return;

  button.disabled = incidentSaveButtonLoading;
  button.textContent = incidentSaveButtonLoading
    ? (activeIncidentRecordId ? "更新中" : "儲存中")
    : (activeIncidentRecordId ? "更新" : "儲存");
}

function markIncidentCheck(label) {
  const check = getIncidentChecks().find((item) => item.dataset.incidentCheck === label);
  if (!check || check.checked) return false;

  check.checked = true;
  if (window.__mspIncidentChecklist && typeof window.__mspIncidentChecklist.markCheck === "function") {
    window.__mspIncidentChecklist.markCheck(label);
  } else {
    syncIncidentChecklistBridge();
  }
  return true;
}

function hasIncidentContent(state) {
  return Object.values(state.fields || {}).some((value) => String(value || "").trim())
    || Object.values(state.checks || {}).some(Boolean)
    || Object.values(state.radios || {}).some(Boolean)
    || Object.values(state.followups || {}).some(Boolean);
}

function prepareJiraIssueDraft() {
  const state = readIncidentStateFromPage();

  clearError();
  if (hasIncidentContent(state)) {
    updateHandoverSummary();
  }

  return {
    handoverSummary: buildHandoverSummary("full"),
    hasContent: hasIncidentContent(state),
    incident: state,
  };
}

function markJiraIssueCreated() {
  markIncidentCheck("補上 Jira / 小卡處理紀錄");
  saveIncidentState();
  updateHandoverSummary();
}

function createJiraIssue() {
  if (
    window.__mspJiraStatus
    && typeof window.__mspJiraStatus.createIssueFromCurrentIncident === "function"
  ) {
    return window.__mspJiraStatus.createIssueFromCurrentIncident();
  }

  setJiraStatus("Jira 建卡功能尚未載入完成。", "error");
  return undefined;
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

function getIncidentRecordViewModel(record) {
  const trackingStatus = getIncidentRecordTrackingStatus(record);
  const savedTimeValue = record && (record.updatedAt || record.createdAt);
  const nextCheckValue = getIncidentRecordNextCheckValue(record);

  return {
    id: String(record && record.id || ""),
    isDue: isIncidentRecordDue(record),
    isReadyToResolve: isIncidentRecordReadyToResolve(record),
    isResolved: isIncidentRecordResolved(record),
    meta: getIncidentRecordMeta(record),
    nextCheckDateTime: nextCheckValue,
    nextCheckLabel: getIncidentRecordNextCheckLabel(record),
    savedTime: formatIncidentRecordSavedTime(record),
    savedTimeDateTime: String(savedTimeValue || ""),
    summary: String(record && record.summary || ""),
    title: String(record && record.title || "未命名事件"),
    trackingClass: getIncidentTrackingStatusClass(trackingStatus),
    trackingStatus,
  };
}

function syncIncidentHistoryListBridge(nextState) {
  if (window.__mspIncidentHistoryList && typeof window.__mspIncidentHistoryList.syncState === "function") {
    window.__mspIncidentHistoryList.syncState(nextState);
    return true;
  }

  return false;
}

function setIncidentHistoryListMessage(message) {
  syncIncidentHistoryListBridge({ emptyText: message, records: [] });
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

const INCIDENT_HISTORY_FOCUS_OPTIONS = [
  { key: "due", label: "待確認", title: "下次確認時間已到或逾期" },
  { key: "upcoming", label: "2 小時內", title: "下次確認時間在 2 小時內" },
  { key: "missingNextStep", label: "缺下一步", title: "仍需追蹤但未填下一步" },
  { key: "waiting", label: "等回覆", title: "正在等待客戶或二線回覆" },
  { key: "readyToResolve", label: "可結案", title: "追蹤狀態已標成可結案" },
];

function getIncidentFocusState(records = incidentRecordsCache) {
  return {
    activeFocus: incidentHistoryFilters.focus,
    counts: getIncidentFocusCounts(records),
    options: INCIDENT_HISTORY_FOCUS_OPTIONS,
  };
}

function syncIncidentFocusBridge(records = incidentRecordsCache) {
  if (window.__mspIncidentHistoryFocus && typeof window.__mspIncidentHistoryFocus.syncState === "function") {
    window.__mspIncidentHistoryFocus.syncState(getIncidentFocusState(records));
    return true;
  }

  return false;
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

function renderIncidentFocusBar(records = incidentRecordsCache) {
  syncIncidentFocusBridge(records);
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
  const matches = getDuplicateIncidentMatches(state);
  duplicateIncidentActions.clear();
  matches.forEach((record) => {
    duplicateIncidentActions.set(record.id, () => restoreIncidentRecord(record));
  });

  if (window.__mspDuplicateIncidentStatus && typeof window.__mspDuplicateIncidentStatus.syncState === "function") {
    window.__mspDuplicateIncidentStatus.syncState({
      matches: matches.map((record) => ({
        id: record.id,
        title: record.title || "未命名事件",
      })),
    });
  }
}

function refreshDuplicateIncidentStatus() {
  renderDuplicateIncidentStatus();
}

function restoreDuplicateIncidentMatch(matchId) {
  const action = duplicateIncidentActions.get(matchId);
  if (typeof action === "function") {
    action();
  }
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
  activateAppView("dashboard");
  const title = document.getElementById("incidentTitle");
  if (title) title.focus();
}

function getIncidentRecordById(recordId) {
  const id = String(recordId || "");
  return incidentRecordsCache.find((record) => String(record.id || "") === id) || null;
}

function restoreIncidentRecordById(recordId) {
  restoreIncidentRecord(getIncidentRecordById(recordId));
}

async function copyIncidentRecordSummary(record) {
  if (!record) return;

  try {
    await navigator.clipboard.writeText(record.handoverSummary || "");
    setIncidentHistoryStatus("已複製這筆事件的交班摘要。", "success");
  } catch (err) {
    setIncidentHistoryStatus("複製事件摘要失敗：" + err.message, "error");
  }
}

async function copyIncidentRecordSummaryById(recordId) {
  await copyIncidentRecordSummary(getIncidentRecordById(recordId));
}

async function resolveIncidentRecord(record) {
  if (!record || !record.id) return;
  if (!confirm(`確定要將「${record.title || "未命名事件"}」標記為已解決？`)) return;

  try {
    setIncidentHistoryStatus("正在標記已解決...", "pending");
    const data = await getIncidentHistoryApi("resolveRecord")(record.id);

    if (activeIncidentRecordId === record.id && data.incident && data.incident.incident) {
      applyIncidentStateToPage(data.incident.incident);
      setActiveIncidentSavedSnapshot(data.incident);
      saveIncidentState();
      updateHandoverSummary();
    }

    setIncidentHistoryStatus(`已結案：${data.incident.title}`, "success");
    await loadIncidentRecords({ showLoading: false });
  } catch (err) {
    if (isStorageUnavailableError(err)) {
      const localRecord = resolveLocalIncidentRecord(record);
      if (!localRecord) {
        setIncidentHistoryStatus("找不到本機事件紀錄。", "error");
        return;
      }

      if (activeIncidentRecordId === record.id && localRecord.incident) {
        applyIncidentStateToPage(localRecord.incident);
        setActiveIncidentSavedSnapshot(localRecord);
        saveIncidentState();
        updateHandoverSummary();
      }

      setIncidentHistoryStatus(`已在此瀏覽器標記結案：${localRecord.title}`, "success");
      loadLocalIncidentRecords(false);
      return;
    }

    setIncidentHistoryStatus("標記已解決失敗：" + err.message, "error");
  }
}

async function resolveIncidentRecordById(recordId) {
  await resolveIncidentRecord(getIncidentRecordById(recordId));
}

async function deleteIncidentRecord(record) {
  if (!record || !record.id) return;
  if (!confirm(`確定要刪除「${record.title || "未命名事件"}」？`)) return;

  try {
    setIncidentHistoryStatus("正在刪除事件紀錄...", "pending");
    await getIncidentHistoryApi("deleteRecord")(record.id);

    if (activeIncidentRecordId === record.id) {
      setActiveIncidentRecordId("");
    }

    setIncidentHistoryStatus("已刪除事件紀錄。", "success");
    await loadIncidentRecords({ showLoading: false });
  } catch (err) {
    if (isStorageUnavailableError(err)) {
      if (!deleteLocalIncidentRecord(record)) {
        setIncidentHistoryStatus("找不到本機事件紀錄。", "error");
        return;
      }

      if (activeIncidentRecordId === record.id) {
        setActiveIncidentRecordId("");
      }

      setIncidentHistoryStatus("已刪除此瀏覽器的本機事件紀錄。", "success");
      loadLocalIncidentRecords(false);
      return;
    }

    setIncidentHistoryStatus("刪除事件紀錄失敗：" + err.message, "error");
  }
}

async function deleteIncidentRecordById(recordId) {
  await deleteIncidentRecord(getIncidentRecordById(recordId));
}

function getUniqueIncidentFilterValues(records, fieldName) {
  return Array.from(new Set((records || [])
    .map((record) => String(record[fieldName] || getIncidentRecordFields(record)[fieldName] || "").trim())
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function getIncidentHistoryFilterState(records = incidentRecordsCache) {
  const customerOptions = getUniqueIncidentFilterValues(records, "customer");
  const systemOptions = getUniqueIncidentFilterValues(records, "system");

  return {
    customer: customerOptions.includes(incidentHistoryFilters.customer) ? incidentHistoryFilters.customer : "",
    customerOptions,
    keyword: incidentHistoryFilters.keyword,
    system: systemOptions.includes(incidentHistoryFilters.system) ? incidentHistoryFilters.system : "",
    systemOptions,
  };
}

function syncIncidentHistoryFilterBridge(records = incidentRecordsCache) {
  const nextState = getIncidentHistoryFilterState(records);
  incidentHistoryFilters.customer = nextState.customer;
  incidentHistoryFilters.system = nextState.system;

  if (window.__mspIncidentHistoryFilters && typeof window.__mspIncidentHistoryFilters.syncState === "function") {
    window.__mspIncidentHistoryFilters.syncState(nextState);
  }
}

function renderIncidentHistoryFilterOptions(records) {
  syncIncidentHistoryFilterBridge(records);
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
  syncIncidentHistoryFilterBridge();
}

function applyIncidentHistoryFilters(nextFilters = {}) {
  incidentHistoryFilters.keyword = Object.prototype.hasOwnProperty.call(nextFilters, "keyword")
    ? String(nextFilters.keyword || "")
    : incidentHistoryFilters.keyword;
  incidentHistoryFilters.customer = Object.prototype.hasOwnProperty.call(nextFilters, "customer")
    ? String(nextFilters.customer || "")
    : incidentHistoryFilters.customer;
  incidentHistoryFilters.system = Object.prototype.hasOwnProperty.call(nextFilters, "system")
    ? String(nextFilters.system || "")
    : incidentHistoryFilters.system;

  syncIncidentHistoryFilterBridge();
  renderIncidentRecords(incidentRecordsCache);
}

function renderIncidentRecords(records) {
  incidentRecordsCache = Array.isArray(records) ? records : [];
  renderIncidentHistoryFilterOptions(incidentRecordsCache);
  renderIncidentFocusBar(incidentRecordsCache);

  if (!records || records.length === 0) {
    const emptyText = incidentHistoryView === "all"
      ? "目前還沒有儲存的事件紀錄"
      : "目前沒有未結案事件紀錄";
    syncIncidentHistoryListBridge({ emptyText, records: [] });
    renderHandoverReadiness();
    renderDuplicateIncidentStatus();
    return;
  }

  const filteredRecords = getFilteredIncidentRecords(records);
  if (!filteredRecords.length) {
    const emptyText = "沒有符合篩選的事件紀錄";
    syncIncidentHistoryListBridge({ emptyText, records: [] });
    renderHandoverReadiness();
    renderDuplicateIncidentStatus();
    return;
  }

  const sortedRecords = [...filteredRecords].sort(compareIncidentRecordsForDisplay);
  syncIncidentHistoryListBridge({
    emptyText: "",
    records: sortedRecords.map(getIncidentRecordViewModel),
  });
  renderHandoverReadiness();
  renderDuplicateIncidentStatus();
}

function refreshIncidentRecordReminderState() {
  if (incidentRecordsCache.length) {
    renderIncidentRecords(incidentRecordsCache);
  }
}

function refreshIncidentHistoryListState() {
  renderIncidentRecords(incidentRecordsCache);
}

function syncIncidentHistoryViewBridge() {
  if (window.__mspIncidentHistoryView && typeof window.__mspIncidentHistoryView.syncView === "function") {
    window.__mspIncidentHistoryView.syncView(incidentHistoryView);
    return true;
  }

  return false;
}

function updateIncidentHistoryViewButtons() {
  if (syncIncidentHistoryViewBridge()) return;

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

function isStorageUnavailableError(err) {
  return /redis client not available|failed to fetch|load failed|networkerror/i.test(String(err && err.message || err || ""));
}

function readLocalIncidentRecords() {
  try {
    const raw = localStorage.getItem(INCIDENT_LOCAL_RECORDS_STORAGE_KEY);
    const records = raw ? JSON.parse(raw) : [];
    return Array.isArray(records) ? records.filter((record) => record && record.id) : [];
  } catch {
    return [];
  }
}

function writeLocalIncidentRecords(records) {
  const normalizedRecords = Array.isArray(records) ? records.slice(0, 50) : [];
  localStorage.setItem(INCIDENT_LOCAL_RECORDS_STORAGE_KEY, JSON.stringify(normalizedRecords));
}

function getLocalIncidentTitle(fields) {
  const title = String(fields.title || "").trim();
  if (title) return title.slice(0, 160);

  const customer = String(fields.customer || "").trim();
  const problem = String(fields.problemDescription || "").trim();
  if (customer && problem) return `${customer} - ${problem}`.slice(0, 160);

  return (problem || customer).slice(0, 160) || "未命名事件";
}

function getLocalIncidentSummary(fields) {
  return String(fields.nextStep || fields.problemDescription || fields.notes || "").trim().slice(0, 180);
}

function buildLocalIncidentRecord(incident, handoverSummary, existing = {}) {
  const now = new Date().toISOString();
  const fields = incident.fields || {};
  const status = fields.status || "";
  const isResolved = /resolved|已解決/i.test(status);

  return {
    id: existing.id || (window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    createdAt: existing.createdAt || now,
    updatedAt: now,
    resolvedAt: isResolved ? (existing.resolvedAt || now) : "",
    title: getLocalIncidentTitle(fields),
    summary: getLocalIncidentSummary(fields),
    severity: fields.severity || "",
    status,
    customer: fields.customer || "",
    system: fields.system || "",
    startedAt: fields.startedAt || "",
    source: fields.source || "",
    incident,
    handoverSummary,
    storage: "local",
  };
}

function getVisibleLocalIncidentRecords() {
  return readLocalIncidentRecords()
    .filter((record) => incidentHistoryView === "all" || !isIncidentRecordResolved(record));
}

function loadLocalIncidentRecords(showStatus = false) {
  incidentRecordsCache = getVisibleLocalIncidentRecords();
  const activeRecord = getActiveIncidentRecord();
  if (activeRecord) {
    setActiveIncidentSavedSnapshot(activeRecord);
  }
  renderIncidentRecords(incidentRecordsCache);

  if (showStatus) {
    setIncidentHistoryStatus("後端事件暫存未連線，已改用此瀏覽器的本機紀錄。", "pending");
  }

  return incidentRecordsCache;
}

function saveLocalIncidentRecord(incident, handoverSummary, recordId = "") {
  const records = readLocalIncidentRecords();
  const existingIndex = records.findIndex((record) => record.id === recordId);
  const existing = existingIndex >= 0 ? records[existingIndex] : {};
  const item = buildLocalIncidentRecord(incident, handoverSummary, existing);
  const nextRecords = existingIndex >= 0
    ? records.map((record, index) => (index === existingIndex ? item : record))
    : [item, ...records];

  writeLocalIncidentRecords(nextRecords.sort(compareIncidentRecordsForDisplay));
  return item;
}

function resolveLocalIncidentRecord(record) {
  const records = readLocalIncidentRecords();
  const index = records.findIndex((item) => item.id === record.id);
  if (index < 0) return null;

  const current = records[index];
  const fields = current.incident && current.incident.fields ? current.incident.fields : {};
  const nextIncident = {
    ...(current.incident || {}),
    fields: {
      ...fields,
      status: "Resolved / 已解決",
    },
  };
  const nextRecord = buildLocalIncidentRecord(
    nextIncident,
    current.handoverSummary || "",
    {
      ...current,
      resolvedAt: current.resolvedAt || new Date().toISOString(),
    },
  );

  records[index] = nextRecord;
  writeLocalIncidentRecords(records.sort(compareIncidentRecordsForDisplay));
  return nextRecord;
}

function deleteLocalIncidentRecord(record) {
  const records = readLocalIncidentRecords();
  const nextRecords = records.filter((item) => item.id !== record.id);
  writeLocalIncidentRecords(nextRecords);
  return nextRecords.length !== records.length;
}

function applyIncidentRecordsResponse(data = {}) {
  incidentRecordsCache = data.incidents || [];
  const activeRecord = getActiveIncidentRecord();
  if (activeRecord) {
    setActiveIncidentSavedSnapshot(activeRecord);
  }
  renderIncidentRecords(incidentRecordsCache);
  return incidentRecordsCache;
}

function handleIncidentRecordsLoadError(err, showLoading) {
  if (isStorageUnavailableError(err)) {
    return loadLocalIncidentRecords(showLoading);
  }

  if (showLoading) {
    setIncidentHistoryListMessage("事件紀錄讀取失敗，請稍後再試。");
    setIncidentHistoryStatus("事件紀錄讀取失敗：" + err.message, "error");
  }

  return incidentRecordsCache;
}

function getIncidentHistoryApi(actionName) {
  const api = window.__mspIncidentHistoryApi;
  const action = api && api[actionName];

  if (typeof action !== "function") {
    throw new Error(`Incident history API bridge is not ready: ${actionName}`);
  }

  return action;
}

async function loadIncidentRecords(options = {}) {
  const showLoading = options.showLoading !== false;

  try {
    updateIncidentHistoryViewButtons();

    if (showLoading) {
      setIncidentHistoryListMessage("事件紀錄載入中...");
    }

    return await getIncidentHistoryApi("loadRecords")({
      limit: 50,
      showLoading,
      view: incidentHistoryView,
    });
  } catch (err) {
    return handleIncidentRecordsLoadError(err, showLoading);
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
    const handoverSummary = buildHandoverSummary("full");
    const data = await getIncidentHistoryApi("saveRecord")({
      handoverSummary,
      incident: state,
      recordId,
    });

    setActiveIncidentRecordId(data.incident.id);
    setActiveIncidentSavedSnapshot(data.incident);
    setIncidentHistoryStatus(`${recordId ? "已更新事件" : "已儲存事件"}：${data.incident.title}`, "success");
    await loadIncidentRecords({ showLoading: false });
  } catch (err) {
    if (isStorageUnavailableError(err)) {
      const handoverSummary = buildHandoverSummary("full");
      const localRecord = saveLocalIncidentRecord(state, handoverSummary, activeIncidentRecordId);
      setActiveIncidentRecordId(localRecord.id);
      setActiveIncidentSavedSnapshot(localRecord);
      setIncidentHistoryStatus(`已暫存在此瀏覽器：${localRecord.title}`, "success");
      loadLocalIncidentRecords(false);
    } else if (activeIncidentRecordId && err.message === "incident not found") {
      setActiveIncidentRecordId("");
      setIncidentHistoryStatus("後端找不到原事件，請重新儲存一次。", "error");
    } else {
      setIncidentHistoryStatus("儲存事件失敗：" + err.message, "error");
    }
  } finally {
    setSaveIncidentButtonLoading(false);
  }
}

function clearIncidentState() {
  if (!confirm("確定要清空目前事件紀錄嗎？")) {
    return;
  }

  clearQuickIncidentInput();
  clearIncidentUiState();
  if (!clearIncidentStateInBridge()) {
    localStorage.removeItem(INCIDENT_STORAGE_KEY);
  }
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
    syncIncidentCoreFieldsBridge();
    syncIncidentChecklistBridge();
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

function getRunbookCategoryName(categoryId) {
  return categoryId || "";
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
  const categoryName = runbook.categoryName || getRunbookCategoryName(runbook.category);
  const summary = truncateRunbookDraftText(runbook.summary, 180);
  const actionItem = truncateRunbookDraftText(getRunbookDraftActionItem(runbook), 160);

  if (categoryName) lines.push(`分類：${categoryName}`);
  if (summary) lines.push(`摘要：${summary}`);
  if (actionItem) lines.push(`初步依據：${actionItem}`);

  return lines.join("\n");
}

function buildRunbookIncidentDraftFields(runbook) {
  const title = runbook.title || "SOP";
  const categoryName = runbook.categoryName || getRunbookCategoryName(runbook.category);
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
  const firstDraftField = document.getElementById("incidentProblemDescription")
    || document.getElementById("incidentCustomer")
    || document.getElementById("incidentTitle");

  activateAppView("dashboard", { scrollTop: false });

  if (firstDraftField) {
    firstDraftField.scrollIntoView({ behavior: "smooth", block: "center" });
    firstDraftField.focus();
  }
}

function applyRunbookToIncidentDraft(runbook) {
  if (!runbook) return;

  const hadDraftContent = hasIncidentContent(readIncidentStateFromPage());
  const appliedFields = Object.entries(buildRunbookIncidentDraftFields(runbook))
    .filter(([fieldName, value]) => applyIncidentTemplateField(fieldName, value)).length;
  const appliedChecklist = markIncidentCheck("查閱對應 SOP") ? 1 : 0;
  const appliedCount = appliedFields + appliedChecklist;

  syncIncidentCoreFieldsBridge();
  renderIncidentNotesTimeline();
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

Object.assign(window, {
  appendQuickIntakeToIncidentNotes,
  applyIncidentRecordsResponse,
  applyIncidentHistoryFilters,
  applyRunbookToIncidentDraft,
  applyQuickIncidentDraft,
  applySelectedIncidentTemplate,
  clearIncidentNextCheckAt,
  clearIncidentState,
  clearQuickIncidentInput,
  copyHandoverSummary,
  copyIncidentRecordSummaryById,
  createJiraIssue,
  deleteIncidentRecordById,
  executeHandoverReadinessAction,
  focusHandoverSummaryStatusField,
  getIncidentPhraseGroups,
  getIncidentTemplateOptions,
  markJiraIssueCreated,
  prepareJiraIssueDraft,
  refreshDuplicateIncidentStatus,
  refreshHandoverReadiness: renderHandoverReadiness,
  refreshHandoverSummaryBadge: updateHandoverSummaryBadge,
  refreshHandoverSummaryMode: updateHandoverSummaryModeButtons,
  refreshHandoverSummaryStatus: syncHandoverSummaryStatusBridge,
  refreshHandoverSummaryText: updateHandoverSummaryText,
  refreshIncidentCoreFieldState,
  refreshIncidentNotesTimeline: renderIncidentNotesTimeline,
  refreshIncidentServiceDetailsState: updateServiceTypeFieldVisibility,
  refreshJiraStatus,
  insertIncidentPhrase,
  loadIncidentRecords,
  refreshIncidentHistoryFilterState: syncIncidentHistoryFilterBridge,
  refreshIncidentHistoryFocusState: syncIncidentFocusBridge,
  refreshIncidentChecklistState,
  refreshIncidentHistoryViewState: updateIncidentHistoryViewButtons,
  refreshIncidentHistoryListState,
  refreshIncidentHistoryStatus,
  refreshIncidentNextCheckAvailability: updateIncidentNextCheckAvailability,
  refreshIncidentActionLabels: updateSaveIncidentButtonLabel,
  saveIncidentRecord,
  restoreDuplicateIncidentMatch,
  resolveIncidentRecordById,
  restoreIncidentRecordById,
  setHandoverSummaryMode,
  setIncidentHistoryFocus,
  setIncidentHistoryView,
  setIncidentNow,
  toggleIncidentPhraseMenu,
});

function runDashboardInitStep(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[Dashboard] ${name} init failed:`, err);
  }
}

function initDashboard() {
  // 訪客統計已搬到 Vue 的 WeatherStatsPanel，這裡只保留舊版事件/SOP互動初始化。
  runDashboardInitStep("incident panel", initIncidentPanel);
  runDashboardInitStep("legacy shell fallback", initLegacyShellFallback);
  loadIncidentRecords();
  setInterval(refreshIncidentRecordReminderState, 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshIncidentRecordReminderState();
    }
  });
}

initDashboard();
