import { reactive } from "vue";
import { legacy } from "../legacyBridge";
import { useWindowBridge } from "./useWindowBridge";

const state = reactive({
  customer: "",
  customerOptions: [],
  keyword: "",
  system: "",
  systemOptions: [],
});

function normalizeOptions(values) {
  return Array.from(new Set((values || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function syncState(nextState = {}) {
  state.keyword = String(nextState.keyword || "");
  state.customer = String(nextState.customer || "");
  state.system = String(nextState.system || "");
  state.customerOptions = normalizeOptions(nextState.customerOptions);
  state.systemOptions = normalizeOptions(nextState.systemOptions);
}

function applyFilters(nextFilters) {
  syncState({
    ...state,
    ...nextFilters,
  });
  legacy("applyIncidentHistoryFilters", {
    customer: state.customer,
    keyword: state.keyword,
    system: state.system,
  });
}

export function useIncidentHistoryFilters() {
  useWindowBridge("__mspIncidentHistoryFilters", {
    syncState,
  }, {
    refresh: "refreshIncidentHistoryFilterState",
  });

  return {
    applyFilters,
    state,
  };
}
