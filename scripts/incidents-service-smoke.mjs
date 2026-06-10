#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const originalLog = console.log;

function assert(condition, message, detail = {}) {
  if (condition) return;

  const error = new Error(message);
  error.detail = detail;
  throw error;
}

function buildPayload(title, status = "Triage / 初步判斷") {
  return {
    incident: {
      fields: {
        customer: "Codex",
        nextStep: "Verify incidents service smoke path",
        severity: "Warning / 警告",
        status,
        system: "service smoke",
        title,
      },
      checks: { "查閱對應 SOP": true },
      followups: {},
      radios: {},
    },
    handoverSummary: `${title} handover summary`,
  };
}

async function main() {
  console.log = () => {};

  const redisSvc = require("../services/redis");
  redisSvc.getRedisClient = () => null;

  const {
    IncidentServiceError,
    createIncidentRecord,
    deleteIncidentRecord,
    listIncidentRecords,
    resolveIncidentRecord,
    updateIncidentRecord,
  } = require("../services/incidents");

  let validationFailed = false;
  try {
    await createIncidentRecord({ incident: { fields: {} }, handoverSummary: "" });
  } catch (error) {
    validationFailed = error instanceof IncidentServiceError && error.status === 400;
  }
  assert(validationFailed, "empty incident should fail validation");

  const created = await createIncidentRecord(buildPayload("Incident service smoke"));
  const id = created.incident?.id;
  assert(id, "created incident should include id", created);
  assert(created.storage === "memory", "service smoke should exercise memory fallback", created);

  const updated = await updateIncidentRecord(id, buildPayload("Incident service smoke updated", "Waiting / 等待回覆"));
  assert(updated.incident.title === "Incident service smoke updated", "updated incident should keep new title", updated);

  const resolved = await resolveIncidentRecord(id);
  assert(resolved.incident.status === "Resolved / 已解決", "resolved incident should have resolved status", resolved);
  assert(resolved.incident.resolvedAt, "resolved incident should include resolvedAt", resolved);

  const all = await listIncidentRecords({ view: "all", limit: "50" });
  const open = await listIncidentRecords({ view: "open", limit: "50" });
  assert(all.incidents.some((item) => item.id === id), "all view should include resolved incident", all);
  assert(!open.incidents.some((item) => item.id === id), "open view should exclude resolved incident", open);

  const deleted = await deleteIncidentRecord(id);
  assert(deleted.deleted === true && deleted.id === id, "delete should acknowledge deleted incident", deleted);

  const afterDelete = await listIncidentRecords({ view: "all", limit: "50" });
  assert(!afterDelete.incidents.some((item) => item.id === id), "deleted incident should not remain in all view", afterDelete);

  originalLog(JSON.stringify({
    id,
    storage: created.storage,
    validationFailed,
    resolvedStatus: resolved.incident.status,
    deleted: deleted.deleted,
  }, null, 2));
}

main().catch((error) => {
  console.log = originalLog;
  console.error(error.message);
  if (error.detail) {
    console.error(JSON.stringify(error.detail, null, 2));
  }
  process.exitCode = 1;
}).finally(() => {
  console.log = originalLog;
});
