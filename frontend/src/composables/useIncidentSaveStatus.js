import { computed, reactive } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const INCIDENT_ACTIVE_RECORD_STORAGE_KEY = "noc_incident_active_record_id";

const state = reactive({
  activeRecordId: "",
  hasActiveRecordFallback: false,
  hasActiveRecord: false,
  isSaving: false,
  savedSnapshot: null,
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeRecordId(id) {
  return String(id || "").trim();
}

function cloneSavedSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;

  try {
    return JSON.parse(JSON.stringify(snapshot));
  } catch {
    return null;
  }
}

function persistActiveRecordId(id) {
  try {
    if (id) {
      localStorage.setItem(INCIDENT_ACTIVE_RECORD_STORAGE_KEY, id);
      return;
    }

    localStorage.removeItem(INCIDENT_ACTIVE_RECORD_STORAGE_KEY);
  } catch {
    // Active record id is convenience state; memory state still keeps the current session usable.
  }
}

function setActiveRecordId(id, options = {}) {
  const nextId = normalizeRecordId(id);
  const didChange = nextId !== state.activeRecordId;

  state.activeRecordId = nextId;
  state.hasActiveRecord = Boolean(nextId);
  state.hasActiveRecordFallback = false;

  if (didChange) {
    state.savedSnapshot = null;
  }

  if (options.persist !== false) {
    persistActiveRecordId(nextId);
  }

  return state.activeRecordId;
}

function loadActiveRecordId() {
  try {
    return setActiveRecordId(localStorage.getItem(INCIDENT_ACTIVE_RECORD_STORAGE_KEY) || "", {
      persist: false,
    });
  } catch {
    return setActiveRecordId("", { persist: false });
  }
}

function clearActiveRecordId() {
  return setActiveRecordId("");
}

function getActiveRecordId() {
  return state.activeRecordId;
}

function setSavedSnapshot(snapshot) {
  state.savedSnapshot = cloneSavedSnapshot(snapshot);
  return getSavedSnapshot();
}

function clearSavedSnapshot() {
  state.savedSnapshot = null;
  return state.savedSnapshot;
}

function getSavedSnapshot() {
  return cloneSavedSnapshot(state.savedSnapshot);
}

function getState() {
  return {
    activeRecordId: state.activeRecordId,
    hasActiveRecord: Boolean(state.activeRecordId || state.hasActiveRecordFallback),
    isSaving: state.isSaving,
    savedSnapshot: getSavedSnapshot(),
  };
}

function syncState(nextState = {}) {
  if (hasOwn(nextState, "activeRecordId")) {
    setActiveRecordId(nextState.activeRecordId, { persist: false });
  }

  if (hasOwn(nextState, "hasActiveRecord")) {
    state.hasActiveRecordFallback = Boolean(nextState.hasActiveRecord) && !state.activeRecordId;
    state.hasActiveRecord = Boolean(state.activeRecordId || state.hasActiveRecordFallback);
  }

  if (hasOwn(nextState, "isSaving")) {
    state.isSaving = Boolean(nextState.isSaving);
  } else if (hasOwn(nextState, "isLoading")) {
    state.isSaving = Boolean(nextState.isLoading);
  }

  if (hasOwn(nextState, "savedSnapshot")) {
    setSavedSnapshot(nextState.savedSnapshot);
  }
}

export function useIncidentSaveStatus() {
  const hasActiveRecord = computed(() => Boolean(state.activeRecordId || state.hasActiveRecordFallback));
  const saveLabel = computed(() => {
    if (state.isSaving) {
      return hasActiveRecord.value ? "更新中" : "儲存中";
    }

    return hasActiveRecord.value ? "更新" : "儲存";
  });

  useWindowBridge("__mspIncidentSaveStatus", {
    clearActiveRecordId,
    clearSavedSnapshot,
    getActiveRecordId,
    getSavedSnapshot,
    getState,
    loadActiveRecordId,
    setActiveRecordId,
    setSavedSnapshot,
    syncState,
  }, {
    refresh: "refreshIncidentActionLabels",
  });

  return {
    activeRecordId: computed(() => state.activeRecordId),
    hasActiveRecord,
    isSaving: computed(() => state.isSaving),
    saveLabel,
    state,
  };
}
