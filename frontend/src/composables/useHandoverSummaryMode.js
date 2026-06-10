import { ref } from "vue";
import { legacy } from "../legacyBridge";
import { useWindowBridge } from "./useWindowBridge";

export const HANDOVER_SUMMARY_MODE_OPTIONS = [
  { id: "full", label: "完整" },
  { id: "compact", label: "精簡" },
  { id: "update", label: "更新" },
];

const activeMode = ref("full");

function normalizeMode(mode) {
  return HANDOVER_SUMMARY_MODE_OPTIONS.some((option) => option.id === mode)
    ? mode
    : "full";
}

function syncMode(mode) {
  activeMode.value = normalizeMode(mode);
}

function setMode(mode) {
  const normalizedMode = normalizeMode(mode);
  activeMode.value = normalizedMode;
  legacy("setHandoverSummaryMode", normalizedMode);
}

export function useHandoverSummaryMode() {
  useWindowBridge("__mspHandoverSummaryMode", {
    syncMode,
  }, {
    refresh: "refreshHandoverSummaryMode",
  });

  return {
    activeMode,
    modes: HANDOVER_SUMMARY_MODE_OPTIONS,
    setMode,
  };
}
