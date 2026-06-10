import { computed, reactive } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const state = reactive({
  fields: [],
  message: "",
  type: "",
});

function syncState(nextState = {}) {
  state.message = String(nextState.message || "");
  state.type = String(nextState.type || "");
  state.fields = Array.isArray(nextState.fields)
    ? nextState.fields
      .map((field) => ({
        id: String(field.id || ""),
        label: String(field.label || ""),
      }))
      .filter((field) => field.id && field.label)
    : [];
}

export function useHandoverSummaryStatus() {
  useWindowBridge("__mspHandoverSummaryStatus", {
    syncState,
  }, {
    refresh: "refreshHandoverSummaryStatus",
  });

  return {
    hasStatus: computed(() => Boolean(state.message || state.fields.length)),
    state,
  };
}
