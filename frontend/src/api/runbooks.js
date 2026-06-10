import { requestJson } from "./client";

export function getRunbooks() {
  return requestJson("/api/runbooks");
}
