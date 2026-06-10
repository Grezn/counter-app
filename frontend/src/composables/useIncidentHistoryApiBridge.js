import {
  createIncidentRecord,
  deleteIncidentRecord,
  listIncidentRecords,
  resolveIncidentRecord,
  updateIncidentRecord,
} from "../api/incidents";
import { legacy } from "../legacyBridge";
import { useWindowBridge } from "./useWindowBridge";

async function loadRecords(options = {}) {
  const data = await listIncidentRecords({
    limit: options.limit || 50,
    view: options.view || "open",
  });

  return legacy("applyIncidentRecordsResponse", data);
}

function deleteRecord(recordId) {
  return deleteIncidentRecord(recordId);
}

function resolveRecord(recordId) {
  return resolveIncidentRecord(recordId);
}

function saveRecord(options = {}) {
  const payload = {
    handoverSummary: options.handoverSummary,
    incident: options.incident,
  };

  return options.recordId
    ? updateIncidentRecord(options.recordId, payload)
    : createIncidentRecord(payload);
}

const incidentHistoryApiBridge = {
  deleteRecord,
  loadRecords,
  resolveRecord,
  saveRecord,
};

export function useIncidentHistoryApiBridge() {
  useWindowBridge("__mspIncidentHistoryApi", incidentHistoryApiBridge);
}
