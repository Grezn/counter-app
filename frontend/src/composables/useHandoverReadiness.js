import { computed, reactive } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const state = reactive({
  isReady: true,
  issues: [],
  label: "",
  message: "",
});

function syncState(nextState = {}) {
  state.isReady = Boolean(nextState.isReady);
  state.label = String(nextState.label || "");
  state.message = String(nextState.message || "");
  state.issues = Array.isArray(nextState.issues)
    ? nextState.issues
      .map((issue) => ({
        id: String(issue.id || ""),
        label: String(issue.label || ""),
      }))
      .filter((issue) => issue.id && issue.label)
    : [];
}

export function useHandoverReadiness() {
  useWindowBridge("__mspHandoverReadiness", {
    syncState,
  }, {
    refresh: "refreshHandoverReadiness",
  });

  return {
    hasStatus: computed(() => Boolean(state.label || state.message || state.issues.length)),
    state,
  };
}
