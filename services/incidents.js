const crypto = require("crypto");

const redisSvc = require("./redis");

const INCIDENT_LIST_KEY = "incidents:recent";
const INCIDENT_HASH_KEY = "incidents:items";
const INCIDENT_ORDER_KEY = "incidents:order";
const INCIDENT_MIGRATION_KEY = "incidents:migrated:v2";
const MAX_STORED_INCIDENTS = 50;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

const memoryIncidentRecords = new Map();

class IncidentServiceError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.name = "IncidentServiceError";
    this.status = status;
    this.data = data;
  }
}

function getRedis() {
  if (typeof redisSvc.getRedisClient === "function") {
    return redisSvc.getRedisClient();
  }

  return null;
}

function getRedisStatus() {
  const redis = getRedis();
  if (!redis) return "not_connected";
  return redis.isReady ? "ready" : redis.isOpen ? "connected" : "not_connected";
}

function createIncidentError(status, message, data = {}) {
  return new IncidentServiceError(status, message, {
    redis: getRedisStatus(),
    ...data,
  });
}

function normalizeText(value, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function pickObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sanitizeMap(value, maxValueLength = 4000) {
  return Object.fromEntries(
    Object.entries(pickObject(value))
      .filter(([key]) => typeof key === "string" && key.length <= 80)
      .map(([key, item]) => [key, normalizeText(item, maxValueLength)]),
  );
}

function sanitizeBooleanMap(value) {
  return Object.fromEntries(
    Object.entries(pickObject(value))
      .filter(([key]) => typeof key === "string" && key.length <= 120)
      .map(([key, item]) => [key, Boolean(item)]),
  );
}

function sanitizeIncidentState(value) {
  const incident = pickObject(value);

  return {
    fields: sanitizeMap(incident.fields),
    checks: sanitizeBooleanMap(incident.checks),
    radios: sanitizeMap(incident.radios, 200),
    followups: sanitizeBooleanMap(incident.followups),
  };
}

function hasIncidentContent(incident, handoverSummary) {
  return Object.values(incident.fields).some(Boolean)
    || Object.values(incident.checks).some(Boolean)
    || Object.values(incident.radios).some(Boolean)
    || Object.values(incident.followups).some(Boolean)
    || Boolean(handoverSummary);
}

function getIncidentTitle(fields) {
  return normalizeText(fields.title, 160)
    || normalizeText(fields.problemDescription, 160)
    || "未命名事件";
}

function getIncidentSummary(fields) {
  return normalizeText(fields.nextStep, 180)
    || normalizeText(fields.problemDescription, 180)
    || normalizeText(fields.notes, 180);
}

function isResolvedStatus(status) {
  const normalized = normalizeText(status, 200).toLowerCase();
  return normalized.includes("resolved") || normalized.includes("已解決");
}

function isIncidentRecordResolved(record) {
  return Boolean(record && (record.resolvedAt || isResolvedStatus(record.status)));
}

function buildIncidentItem(incident, handoverSummary, existing = {}) {
  const now = new Date().toISOString();
  const fields = incident.fields;
  const status = fields.status || "";

  return {
    id: existing.id || crypto.randomUUID(),
    createdAt: existing.createdAt || now,
    updatedAt: now,
    resolvedAt: isResolvedStatus(status) ? (existing.resolvedAt || now) : "",
    title: getIncidentTitle(fields),
    summary: getIncidentSummary(fields),
    severity: fields.severity || "",
    status,
    customer: fields.customer || "",
    system: fields.system || "",
    startedAt: fields.startedAt || "",
    source: fields.source || "",
    incident,
    handoverSummary,
  };
}

function getIncidentPayload(body) {
  const incident = sanitizeIncidentState(body && body.incident);
  const handoverSummary = normalizeText(body && body.handoverSummary, 20000);

  if (!hasIncidentContent(incident, handoverSummary)) {
    throw createIncidentError(400, "incident content is required");
  }

  return {
    handoverSummary,
    incident,
  };
}

function parseLimit(value) {
  const limit = Number.parseInt(value, 10);
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(limit, MAX_LIST_LIMIT);
}

function safeParseIncident(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getIncidentScore(record, fallbackScore = Date.now()) {
  const timestamp = Date.parse(record && (record.updatedAt || record.createdAt));
  return Number.isFinite(timestamp) ? timestamp : fallbackScore;
}

async function readLegacyIncidentRecords(redis) {
  return (await redis.lRange(INCIDENT_LIST_KEY, 0, MAX_STORED_INCIDENTS - 1))
    .map(safeParseIncident)
    .filter((item) => item && item.id);
}

async function migrateLegacyIncidentRecords(redis) {
  const migrated = await redis.get(INCIDENT_MIGRATION_KEY);
  if (migrated) return;

  const existingCount = await redis.zCard(INCIDENT_ORDER_KEY);
  if (existingCount > 0) {
    await redis.set(INCIDENT_MIGRATION_KEY, new Date().toISOString());
    return;
  }

  const legacyRecords = await readLegacyIncidentRecords(redis);
  const multi = redis.multi();
  const now = Date.now();

  legacyRecords.forEach((record, index) => {
    const score = getIncidentScore(record, now - index);
    multi.hSet(INCIDENT_HASH_KEY, record.id, JSON.stringify(record));
    multi.zAdd(INCIDENT_ORDER_KEY, [{ score, value: record.id }]);
  });

  multi.set(INCIDENT_MIGRATION_KEY, new Date().toISOString());
  await multi.exec();
}

async function trimIncidentRecords(redis) {
  const count = await redis.zCard(INCIDENT_ORDER_KEY);
  if (count <= MAX_STORED_INCIDENTS) return;

  const staleIds = await redis.zRange(INCIDENT_ORDER_KEY, 0, count - MAX_STORED_INCIDENTS - 1);
  if (!staleIds.length) return;

  await redis.multi()
    .zRem(INCIDENT_ORDER_KEY, staleIds)
    .hDel(INCIDENT_HASH_KEY, staleIds)
    .exec();
}

async function readRedisIncidentRecords(redis, limit = MAX_STORED_INCIDENTS) {
  await migrateLegacyIncidentRecords(redis);

  const ids = await redis.zRange(INCIDENT_ORDER_KEY, 0, limit - 1, { REV: true });
  if (!ids.length) return [];

  const values = await redis.hmGet(INCIDENT_HASH_KEY, ids);
  const missingIds = [];
  const records = values
    .map((raw, index) => {
      const record = raw ? safeParseIncident(raw) : null;
      if (!record) missingIds.push(ids[index]);
      return record;
    })
    .filter(Boolean);

  if (missingIds.length) {
    await redis.zRem(INCIDENT_ORDER_KEY, missingIds);
  }

  return records;
}

async function readRedisIncidentRecord(redis, id) {
  await migrateLegacyIncidentRecords(redis);

  const raw = await redis.hGet(INCIDENT_HASH_KEY, id);
  return raw ? safeParseIncident(raw) : null;
}

async function writeRedisIncidentRecord(redis, record) {
  await migrateLegacyIncidentRecords(redis);

  await redis.multi()
    .hSet(INCIDENT_HASH_KEY, record.id, JSON.stringify(record))
    .zAdd(INCIDENT_ORDER_KEY, [{ score: getIncidentScore(record), value: record.id }])
    .exec();

  await trimIncidentRecords(redis);
}

async function deleteRedisIncidentRecord(redis, id) {
  await migrateLegacyIncidentRecords(redis);

  const record = await readRedisIncidentRecord(redis, id);
  if (!record) return null;

  await redis.multi()
    .hDel(INCIDENT_HASH_KEY, id)
    .zRem(INCIDENT_ORDER_KEY, id)
    .exec();

  return record;
}

function getIncidentRecordView(value) {
  return normalizeText(value, 20).toLowerCase() === "all" ? "all" : "open";
}

function normalizeIncidentId(value) {
  return normalizeText(value, 80);
}

function requireIncidentId(value) {
  const id = normalizeIncidentId(value);
  if (!id) {
    throw createIncidentError(400, "incident id is required");
  }

  return id;
}

function getMemoryIncidentRecords(limit = MAX_STORED_INCIDENTS) {
  return Array.from(memoryIncidentRecords.values())
    .sort((a, b) => getIncidentScore(b) - getIncidentScore(a))
    .slice(0, limit);
}

function trimMemoryIncidentRecords() {
  const staleItems = getMemoryIncidentRecords(Number.MAX_SAFE_INTEGER)
    .slice(MAX_STORED_INCIDENTS);

  staleItems.forEach((item) => {
    memoryIncidentRecords.delete(item.id);
  });
}

function readMemoryIncidentRecord(id) {
  return memoryIncidentRecords.get(id) || null;
}

function writeMemoryIncidentRecord(record) {
  memoryIncidentRecords.set(record.id, record);
  trimMemoryIncidentRecords();
}

function deleteMemoryIncidentRecord(id) {
  const record = readMemoryIncidentRecord(id);
  if (!record) return null;

  memoryIncidentRecords.delete(id);
  return record;
}

function sendIncidentEvent(event, item) {
  console.log(JSON.stringify({
    type: "incident",
    event,
    id: item.id,
    title: item.title,
    timestamp: item.updatedAt || new Date().toISOString(),
  }));
}

async function listIncidentRecords(query = {}) {
  const redis = getRedis();
  const limit = parseLimit(query.limit);
  const view = getIncidentRecordView(query.view);

  if (!redis) {
    const items = getMemoryIncidentRecords()
      .filter((item) => view === "all" || !isIncidentRecordResolved(item))
      .slice(0, limit);

    return {
      incidents: items,
      view,
      redis: getRedisStatus(),
      storage: "memory",
    };
  }

  const items = (await readRedisIncidentRecords(redis))
    .filter((item) => view === "all" || !isIncidentRecordResolved(item))
    .slice(0, limit);

  return {
    incidents: items,
    view,
    redis: getRedisStatus(),
    storage: "redis",
  };
}

async function createIncidentRecord(body) {
  const redis = getRedis();
  const { incident, handoverSummary } = getIncidentPayload(body);
  const item = buildIncidentItem(incident, handoverSummary);

  if (!redis) {
    writeMemoryIncidentRecord(item);
    sendIncidentEvent("created_memory", item);

    return {
      incident: item,
      redis: getRedisStatus(),
      storage: "memory",
    };
  }

  await writeRedisIncidentRecord(redis, item);
  sendIncidentEvent("created", item);

  return {
    incident: item,
    redis: getRedisStatus(),
    storage: "redis",
  };
}

async function updateIncidentRecord(idValue, body) {
  const id = requireIncidentId(idValue);
  const redis = getRedis();
  const { incident, handoverSummary } = getIncidentPayload(body);
  const existingRecord = redis
    ? await readRedisIncidentRecord(redis, id)
    : readMemoryIncidentRecord(id);

  if (!existingRecord) {
    throw createIncidentError(404, "incident not found");
  }

  const item = buildIncidentItem(incident, handoverSummary, existingRecord);

  if (redis) {
    await writeRedisIncidentRecord(redis, item);
    sendIncidentEvent("updated", item);
  } else {
    writeMemoryIncidentRecord(item);
    sendIncidentEvent("updated_memory", item);
  }

  return {
    incident: item,
    redis: getRedisStatus(),
    storage: redis ? "redis" : "memory",
  };
}

async function resolveIncidentRecord(idValue) {
  const id = requireIncidentId(idValue);
  const redis = getRedis();
  const item = redis ? await readRedisIncidentRecord(redis, id) : readMemoryIncidentRecord(id);

  if (!item) {
    throw createIncidentError(404, "incident not found");
  }

  const now = new Date().toISOString();
  const fields = item.incident && item.incident.fields ? item.incident.fields : {};
  const nextFields = {
    ...fields,
    status: "Resolved / 已解決",
  };
  const nextItem = {
    ...item,
    updatedAt: now,
    resolvedAt: item.resolvedAt || now,
    status: nextFields.status,
    incident: {
      ...(item.incident || {}),
      fields: nextFields,
    },
  };

  if (redis) {
    await writeRedisIncidentRecord(redis, nextItem);
  } else {
    writeMemoryIncidentRecord(nextItem);
  }

  sendIncidentEvent(redis ? "resolved" : "resolved_memory", nextItem);

  return {
    incident: nextItem,
    redis: getRedisStatus(),
    storage: redis ? "redis" : "memory",
  };
}

async function deleteIncidentRecord(idValue) {
  const id = requireIncidentId(idValue);
  const redis = getRedis();
  const deleted = redis ? await deleteRedisIncidentRecord(redis, id) : deleteMemoryIncidentRecord(id);

  if (!deleted) {
    throw createIncidentError(404, "incident not found");
  }

  console.log(JSON.stringify({
    type: "incident",
    event: redis ? "deleted" : "deleted_memory",
    id,
    title: deleted.title,
    timestamp: new Date().toISOString(),
  }));

  return {
    deleted: true,
    id,
    redis: getRedisStatus(),
    storage: redis ? "redis" : "memory",
  };
}

module.exports = {
  IncidentServiceError,
  createIncidentRecord,
  deleteIncidentRecord,
  getRedisStatus,
  listIncidentRecords,
  resolveIncidentRecord,
  updateIncidentRecord,
};
