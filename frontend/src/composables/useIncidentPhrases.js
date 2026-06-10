import { computed, reactive, ref, watch } from "vue";
import { legacy, legacyReady } from "../legacyBridge";
import { useWindowBridge } from "./useWindowBridge";

const activeGroup = ref("");
const groups = reactive({});

function normalizeGroups(nextGroups) {
  return (nextGroups || [])
    .map((group) => ({
      fieldId: String(group.fieldId || "").trim(),
      menuId: String(group.menuId || "").trim(),
      name: String(group.name || "").trim(),
      phrases: (group.phrases || [])
        .map((phrase) => String(phrase || "").trim())
        .filter(Boolean),
    }))
    .filter((group) => group.name && group.fieldId && group.menuId);
}

function syncPhraseGroups(nextGroups) {
  Object.keys(groups).forEach((key) => {
    delete groups[key];
  });

  normalizeGroups(nextGroups).forEach((group) => {
    groups[group.name] = group;
  });

  if (activeGroup.value && !groups[activeGroup.value]) {
    activeGroup.value = "";
  }
}

function refreshPhraseGroups() {
  if (typeof window.getIncidentPhraseGroups === "function") {
    syncPhraseGroups(window.getIncidentPhraseGroups());
  }
}

function closeMenus() {
  activeGroup.value = "";
}

function toggleGroup(groupName) {
  activeGroup.value = activeGroup.value === groupName ? "" : groupName;
}

function insertPhrase(groupName, phrase) {
  legacy("insertIncidentPhrase", groupName, phrase);
  closeMenus();
}

export function useIncidentPhrases(groupName) {
  useWindowBridge("__mspIncidentPhrases", {
    closeMenus,
    syncPhraseGroups,
    syncOpenGroup: (nextGroup) => {
      activeGroup.value = String(nextGroup || "");
    },
  }, {
    refresh: refreshPhraseGroups,
  });

  watch(legacyReady, (isReady) => {
    if (isReady) refreshPhraseGroups();
  }, { immediate: true });

  return {
    activeGroup,
    closeMenus,
    group: computed(() => groups[groupName] || { phrases: [] }),
    insertPhrase,
    isOpen: computed(() => activeGroup.value === groupName),
    toggleGroup,
  };
}
