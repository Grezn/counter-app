import { computed, reactive } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const state = reactive({
  isComplete: false,
  text: "",
  title: "",
});

function syncState(nextState = {}) {
  state.isComplete = Boolean(nextState.isComplete);
  state.text = String(nextState.text || "");
  state.title = String(nextState.title || "");
}

export function useHandoverSummaryBadge() {
  useWindowBridge("__mspHandoverSummaryBadge", {
    syncState,
  }, {
    refresh: "refreshHandoverSummaryBadge",
  });

  return {
    hasText: computed(() => Boolean(state.text)),
    state,
  };
}
