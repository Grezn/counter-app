import { getIncidentChecklistSnapshot, syncIncidentChecklistSnapshot } from "./useIncidentChecklist";
import { getIncidentCoreFieldsSnapshot, syncIncidentCoreFieldsSnapshot } from "./useIncidentCoreFields";
import { getIncidentNextCheckSnapshot, syncIncidentNextCheckSnapshot } from "./useIncidentNextCheck";
import { getIncidentNotesSnapshot, syncIncidentNotesSnapshot } from "./useIncidentNotesTimeline";
import { getIncidentServiceDetailsSnapshot, syncIncidentServiceDetailsSnapshot } from "./useIncidentServiceDetails";
import { useWindowBridge } from "./useWindowBridge";

const INCIDENT_STORAGE_KEY = "noc_incident_state";

function getIncidentStateSnapshot() {
  const coreFields = getIncidentCoreFieldsSnapshot();
  const nextCheck = getIncidentNextCheckSnapshot();
  const notes = getIncidentNotesSnapshot();
  const serviceDetails = getIncidentServiceDetailsSnapshot();

  const fields = {
    ...coreFields,
    nextCheckAt: nextCheck.nextCheckAt || "",
    trackingStatus: nextCheck.trackingStatus || "",
    notes,
    ...(serviceDetails.fields || {}),
  };

  const radios = {};
  if (serviceDetails.isCustomer) {
    radios.isCustomer = serviceDetails.isCustomer;
  }
  if (serviceDetails.serviceType) {
    radios.serviceType = serviceDetails.serviceType;
  }

  return {
    checks: getIncidentChecklistSnapshot(),
    fields,
    followups: serviceDetails.followups || {},
    radios,
  };
}

function applyIncidentStateSnapshot(nextState = {}) {
  const fields = nextState?.fields || {};
  const radios = nextState?.radios || {};

  syncIncidentCoreFieldsSnapshot(fields);
  syncIncidentNextCheckSnapshot({
    nextCheckAt: fields.nextCheckAt || "",
    trackingStatus: fields.trackingStatus || "",
  });
  syncIncidentNotesSnapshot(fields.notes || "");
  syncIncidentChecklistSnapshot(nextState?.checks || {});
  syncIncidentServiceDetailsSnapshot({
    fields,
    followups: nextState?.followups || {},
    isCustomer: radios.isCustomer || "",
    serviceType: radios.serviceType || "",
  });

  return getIncidentStateSnapshot();
}

function loadStoredIncidentState() {
  const rawState = localStorage.getItem(INCIDENT_STORAGE_KEY);
  return rawState ? JSON.parse(rawState) : null;
}

function saveStoredIncidentState(state = getIncidentStateSnapshot()) {
  localStorage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify(state));
  return state;
}

function clearStoredIncidentState() {
  localStorage.removeItem(INCIDENT_STORAGE_KEY);
}

export function useIncidentStateBridge() {
  useWindowBridge("__mspIncidentState", {
    applyState: applyIncidentStateSnapshot,
    clearState: clearStoredIncidentState,
    getState: getIncidentStateSnapshot,
    loadState: loadStoredIncidentState,
    saveState: saveStoredIncidentState,
  });

  return {
    applyState: applyIncidentStateSnapshot,
    clearState: clearStoredIncidentState,
    getState: getIncidentStateSnapshot,
    loadState: loadStoredIncidentState,
    saveState: saveStoredIncidentState,
  };
}
