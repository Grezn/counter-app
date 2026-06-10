import { computed, ref } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const summaryText = ref("");

function syncText(text = "") {
  summaryText.value = String(text || "");
}

export function useHandoverSummaryText() {
  useWindowBridge("__mspHandoverSummaryText", {
    syncText,
  }, {
    refresh: "refreshHandoverSummaryText",
  });

  return {
    hasSummary: computed(() => Boolean(summaryText.value.trim())),
    summaryText,
  };
}
