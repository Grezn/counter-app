import { ref } from "vue";
import { legacy } from "../legacyBridge";
import { useWindowBridge } from "./useWindowBridge";

export const INCIDENT_HISTORY_VIEW_OPTIONS = [
  { id: "open", label: "未結案" },
  { id: "all", label: "全部" },
];

const activeView = ref("open");

function normalizeView(view) {
  return view === "all" ? "all" : "open";
}

function syncView(view) {
  activeView.value = normalizeView(view);
}

function setView(view) {
  const normalizedView = normalizeView(view);
  activeView.value = normalizedView;
  legacy("setIncidentHistoryView", normalizedView);
}

export function useIncidentHistoryView() {
  useWindowBridge("__mspIncidentHistoryView", {
    syncView,
  }, {
    refresh: "refreshIncidentHistoryViewState",
  });

  return {
    activeView,
    setView,
    views: INCIDENT_HISTORY_VIEW_OPTIONS,
  };
}
