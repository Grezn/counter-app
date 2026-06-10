import { requestJson } from "./client";

const VISITOR_STATS_PATH = "/api/visitor-stats";

export function recordVisitorView(visitorId) {
  return requestJson(`${VISITOR_STATS_PATH}/views`, {
    method: "POST",
    json: { visitorId },
  });
}

export function getVisitorStats() {
  return requestJson(VISITOR_STATS_PATH);
}

export function heartbeatVisitor(visitorId) {
  return requestJson(`${VISITOR_STATS_PATH}/heartbeat`, {
    method: "POST",
    json: { visitorId },
  });
}
