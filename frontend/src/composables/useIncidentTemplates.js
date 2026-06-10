import { reactive, watch } from "vue";
import { legacy, legacyReady } from "../legacyBridge";
import { useWindowBridge } from "./useWindowBridge";

const state = reactive({
  selectedId: "",
  templates: [],
});

function normalizeTemplates(templates) {
  return (templates || [])
    .map((template) => ({
      id: String(template.id || "").trim(),
      label: String(template.label || "").trim(),
    }))
    .filter((template) => template.id && template.label);
}

function syncTemplates(templates) {
  state.templates = normalizeTemplates(templates);

  if (!state.templates.some((template) => template.id === state.selectedId)) {
    state.selectedId = "";
  }
}

function refreshTemplates() {
  if (typeof window.getIncidentTemplateOptions === "function") {
    syncTemplates(window.getIncidentTemplateOptions());
  }
}

function setSelectedTemplate(templateId) {
  state.selectedId = String(templateId || "");
}

function applySelectedTemplate() {
  const templateId = state.selectedId;
  if (!templateId) return;

  legacy("applySelectedIncidentTemplate", templateId);
  state.selectedId = "";
}

export function useIncidentTemplates() {
  useWindowBridge("__mspIncidentTemplates", {
    syncTemplates,
  }, {
    refresh: refreshTemplates,
  });

  watch(legacyReady, (isReady) => {
    if (isReady) refreshTemplates();
  }, { immediate: true });

  return {
    applySelectedTemplate,
    setSelectedTemplate,
    state,
  };
}
