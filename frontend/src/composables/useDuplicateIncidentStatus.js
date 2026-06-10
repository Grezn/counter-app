import { computed, reactive } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const state = reactive({
  matches: [],
});

function syncState(nextState = {}) {
  state.matches = Array.isArray(nextState.matches)
    ? nextState.matches
      .map((match) => ({
        id: String(match.id || ""),
        title: String(match.title || ""),
      }))
      .filter((match) => match.id && match.title)
    : [];
}

export function useDuplicateIncidentStatus() {
  useWindowBridge("__mspDuplicateIncidentStatus", {
    syncState,
  }, {
    refresh: "refreshDuplicateIncidentStatus",
  });

  return {
    hasMatches: computed(() => state.matches.length > 0),
    state,
  };
}
