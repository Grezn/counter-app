import { computed, reactive } from "vue";
import { legacy } from "../legacyBridge";
import { useWindowBridge } from "./useWindowBridge";

const NEXT_CHECK_SKIPPED_STATUSES = new Set(["不需追蹤", "可結案"]);
const NEXT_CHECK_DISABLED_TITLE = "目前追蹤狀態不需要下次確認";
const TRACKING_STATUS_OPTIONS = [
  { label: "未判斷", value: "" },
  { label: "需追蹤", value: "需追蹤" },
  { label: "不需追蹤", value: "不需追蹤" },
  { label: "等客戶回覆", value: "等客戶回覆" },
  { label: "等二線回覆", value: "等二線回覆" },
  { label: "持續監控", value: "持續監控" },
  { label: "可結案", value: "可結案" },
];

function normalizeTrackingStatus(status) {
  return String(status || "").trim();
}

function shouldDisableNextCheck(status) {
  return NEXT_CHECK_SKIPPED_STATUSES.has(normalizeTrackingStatus(status));
}

function normalizeNextCheckAt(value) {
  return String(value || "");
}

const state = reactive({
  nextCheckAt: "",
  trackingStatus: "",
});

function syncState(nextState = {}) {
  state.trackingStatus = normalizeTrackingStatus(nextState.trackingStatus);
  state.nextCheckAt = shouldDisableNextCheck(state.trackingStatus)
    ? ""
    : normalizeNextCheckAt(nextState.nextCheckAt ?? state.nextCheckAt);
}

function setTrackingStatus(trackingStatus) {
  syncState({
    nextCheckAt: state.nextCheckAt,
    trackingStatus,
  });
}

function setNextCheckAt(nextCheckAt) {
  state.nextCheckAt = normalizeNextCheckAt(nextCheckAt);
}

function clearNextCheckAt() {
  setNextCheckAt("");
  legacy("clearIncidentNextCheckAt");
}

function getState() {
  return {
    nextCheckAt: state.nextCheckAt,
    trackingStatus: state.trackingStatus,
  };
}

export function getIncidentNextCheckSnapshot() {
  return getState();
}

export function syncIncidentNextCheckSnapshot(nextState = {}) {
  syncState(nextState);
}

export function useIncidentNextCheck() {
  useWindowBridge("__mspIncidentNextCheck", {
    getState,
    syncState,
  }, {
    refresh: "refreshIncidentNextCheckAvailability",
  });

  const isNextCheckDisabled = computed(() => shouldDisableNextCheck(state.trackingStatus));

  return {
    clearNextCheckAt,
    getState,
    isNextCheckDisabled,
    nextCheckTitle: computed(() => (isNextCheckDisabled.value ? NEXT_CHECK_DISABLED_TITLE : "")),
    setNextCheckAt,
    setTrackingStatus,
    state,
    trackingStatusOptions: TRACKING_STATUS_OPTIONS,
  };
}
