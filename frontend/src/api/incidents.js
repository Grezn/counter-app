import { buildQuery, requestJson } from "./client";

const INCIDENTS_PATH = "/api/incidents";

export function listIncidentRecords(params = {}) {
  return requestJson(`${INCIDENTS_PATH}${buildQuery(params)}`);
}

export function createIncidentRecord({ incident, handoverSummary }) {
  return requestJson(INCIDENTS_PATH, {
    method: "POST",
    json: {
      incident,
      handoverSummary,
    },
  });
}

export function updateIncidentRecord(recordId, { incident, handoverSummary }) {
  return requestJson(`${INCIDENTS_PATH}/${encodeURIComponent(recordId)}`, {
    method: "PUT",
    json: {
      incident,
      handoverSummary,
    },
  });
}

export function resolveIncidentRecord(recordId) {
  return requestJson(`${INCIDENTS_PATH}/${encodeURIComponent(recordId)}/resolve`, {
    method: "PATCH",
  });
}

export function deleteIncidentRecord(recordId) {
  return requestJson(`${INCIDENTS_PATH}/${encodeURIComponent(recordId)}`, {
    method: "DELETE",
  });
}
