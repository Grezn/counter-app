import { reactive } from "vue";
import { useWindowBridge } from "./useWindowBridge";

export const INCIDENT_CHECKLIST_ITEMS = [
  "確認告警時間與來源",
  "確認影響範圍與嚴重度",
  "確認是否影響服務可用性",
  "查閱對應 SOP",
  "通知值班工程師或主管",
  "補上 Jira / 小卡處理紀錄",
  "整理交班資訊",
];

const state = reactive({
  checks: Object.fromEntries(INCIDENT_CHECKLIST_ITEMS.map((item) => [item, false])),
});

function normalizeChecks(checks = {}) {
  return Object.fromEntries(
    INCIDENT_CHECKLIST_ITEMS.map((item) => [item, Boolean(checks[item])]),
  );
}

function syncChecks(nextChecks = {}) {
  const normalizedChecks = normalizeChecks(nextChecks);

  Object.keys(state.checks).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(normalizedChecks, key)) {
      delete state.checks[key];
    }
  });

  Object.entries(normalizedChecks).forEach(([key, value]) => {
    state.checks[key] = value;
  });
}

function setCheck(item, isChecked) {
  if (!Object.prototype.hasOwnProperty.call(state.checks, item)) return false;

  state.checks[item] = Boolean(isChecked);
  return true;
}

function markCheck(item) {
  if (!Object.prototype.hasOwnProperty.call(state.checks, item) || state.checks[item]) {
    return false;
  }

  state.checks[item] = true;
  return true;
}

function clearChecks() {
  syncChecks({});
}

function isChecked(item) {
  return Boolean(state.checks[item]);
}

function getChecks() {
  return { ...state.checks };
}

export function getIncidentChecklistSnapshot() {
  return getChecks();
}

export function syncIncidentChecklistSnapshot(checks = {}) {
  syncChecks(checks);
}

export function useIncidentChecklist() {
  useWindowBridge("__mspIncidentChecklist", {
    clearChecks,
    getChecks,
    markCheck,
    syncChecks,
  }, {
    refresh: "refreshIncidentChecklistState",
  });

  return {
    clearChecks,
    getChecks,
    isChecked,
    items: INCIDENT_CHECKLIST_ITEMS,
    markCheck,
    setCheck,
    state,
  };
}
