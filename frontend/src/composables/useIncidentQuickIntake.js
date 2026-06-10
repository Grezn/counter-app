import { ref } from "vue";
import { legacy } from "../legacyBridge";
import { useWindowBridge } from "./useWindowBridge";

function normalizeText(text) {
  return String(text || "");
}

export function useIncidentQuickIntake() {
  const quickInput = ref("");

  function syncText(text = "") {
    quickInput.value = normalizeText(text);
  }

  function applyQuickDraft() {
    legacy("applyQuickIncidentDraft", quickInput.value);
  }

  function appendQuickDraft() {
    legacy("appendQuickIntakeToIncidentNotes", quickInput.value);
  }

  function clearQuickDraft() {
    syncText("");
    legacy("clearQuickIncidentInput");
  }

  useWindowBridge("__mspIncidentQuickIntake", {
    syncText,
  });

  return {
    appendQuickDraft,
    applyQuickDraft,
    clearQuickDraft,
    quickInput,
  };
}
