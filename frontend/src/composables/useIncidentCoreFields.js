import { reactive } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const CORE_FREEFORM_FIELD_NAMES = [
  "startedAt",
  "customer",
  "system",
  "title",
  "problemDescription",
  "impact",
  "handoverOwner",
  "nextStep",
  "notified",
];

const CORE_FIELD_OPTIONS = {
  severity: [
    { label: "Unclassified / 未分類", value: "" },
    { label: "Info / 資訊", value: "Info / 資訊" },
    { label: "Warning / 警告", value: "Warning / 警告" },
    { label: "Critical / 重大", value: "Critical / 重大" },
    { label: "Service Impact / 服務影響", value: "Service Impact / 服務影響" },
  ],
  status: [
    { label: "Not Started / 未開始", value: "" },
    { label: "Triage / 初步判斷", value: "Triage / 初步判斷" },
    { label: "Notified / 已通知", value: "Notified / 已通知" },
    { label: "Monitoring / 監控中", value: "Monitoring / 監控中" },
    { label: "Waiting / 等待回覆", value: "Waiting / 等待回覆" },
    { label: "Resolved / 已解決", value: "Resolved / 已解決" },
    { label: "Handover / 待交班", value: "Handover / 待交班" },
  ],
  source: [
    { label: "未填", value: "" },
    { label: "Email", value: "Email" },
    { label: "Phone", value: "Phone" },
    { label: "Jira", value: "Jira" },
    { label: "LINE", value: "LINE" },
    { label: "AWS", value: "AWS" },
    { label: "Customer", value: "Customer" },
  ],
};

const CORE_FIELD_VALUE_ALIASES = {
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

const CORE_FIELD_NAMES = [
  ...CORE_FREEFORM_FIELD_NAMES,
  ...Object.keys(CORE_FIELD_OPTIONS),
];

const state = reactive({
  fields: createFieldState(),
});

function createFieldState(values = {}) {
  return Object.fromEntries(
    CORE_FIELD_NAMES.map((fieldName) => [fieldName, normalizeFieldValue(fieldName, values[fieldName])]),
  );
}

function normalizeFieldValue(fieldName, value) {
  const rawValue = String(value || "");
  const normalizedValue = CORE_FIELD_VALUE_ALIASES[fieldName]?.[rawValue] || rawValue;
  const options = CORE_FIELD_OPTIONS[fieldName] || [];

  if (!options.length) return normalizedValue;

  return options.some((option) => option.value === normalizedValue) ? normalizedValue : "";
}

function syncFields(fields = {}) {
  const normalizedFields = createFieldState(fields);

  Object.entries(normalizedFields).forEach(([fieldName, value]) => {
    state.fields[fieldName] = value;
  });
}

function setField(fieldName, value) {
  if (!Object.prototype.hasOwnProperty.call(state.fields, fieldName)) return false;

  state.fields[fieldName] = normalizeFieldValue(fieldName, value);
  return true;
}

function getField(fieldName) {
  return state.fields[fieldName] || "";
}

function getFields() {
  return { ...state.fields };
}

export function getIncidentCoreFieldsSnapshot() {
  return getFields();
}

export function syncIncidentCoreFieldsSnapshot(fields = {}) {
  syncFields(fields);
}

export function useIncidentCoreFields() {
  useWindowBridge("__mspIncidentCoreFields", {
    getFields,
    syncFields,
  }, {
    refresh: "refreshIncidentCoreFieldState",
  });

  return {
    fieldOptions: CORE_FIELD_OPTIONS,
    getField,
    getFields,
    setField,
    state,
  };
}
