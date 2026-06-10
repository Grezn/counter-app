import { computed, reactive } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const state = reactive({
  message: "",
  type: "",
});

function syncState(nextState = {}) {
  state.message = String(nextState.message || "");
  state.type = String(nextState.type || "");
}

export function useIncidentHistoryStatus() {
  useWindowBridge("__mspIncidentHistoryStatus", {
    syncState,
  }, {
    refresh: "refreshIncidentHistoryStatus",
  });

  return {
    hasStatus: computed(() => Boolean(state.message)),
    state,
  };
}
