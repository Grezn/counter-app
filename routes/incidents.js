const express = require("express");
const crypto = require("crypto");

const redisSvc = require("../services/redis");

const router = express.Router();

const INCIDENT_LIST_KEY = "incidents:recent";
const MAX_STORED_INCIDENTS = 50;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

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

async function readIncidentRecords(redis) {
  return (await redis.lRange(INCIDENT_LIST_KEY, 0, MAX_STORED_INCIDENTS - 1))
    .map(safeParseIncident)
    .filter(Boolean);
}

async function writeIncidentRecords(redis, records) {
  await redis.del(INCIDENT_LIST_KEY);

  for (let index = Math.min(records.length, MAX_STORED_INCIDENTS) - 1; index >= 0; index -= 1) {
    await redis.lPush(INCIDENT_LIST_KEY, JSON.stringify(records[index]));
  }
}

function getIncidentRecordView(value) {
  return normalizeText(value, 20).toLowerCase() === "all" ? "all" : "open";
}

function getIncidentId(req) {
  return normalizeText(req.params && req.params.id, 80);
}

router.get("/api/incidents", async (req, res) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({
        error: "redis client not available",
        redis: getRedisStatus(),
      });
    }

    const limit = parseLimit(req.query.limit);
    const view = getIncidentRecordView(req.query.view);
    const items = (await readIncidentRecords(redis))
      .filter((item) => view === "all" || !isIncidentRecordResolved(item))
      .slice(0, limit);

    res.json({
      incidents: items,
      view,
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[Incidents] list failed:", err.message);
    res.status(500).json({
      error: err.message,
      redis: getRedisStatus(),
    });
  }
});

router.post("/api/incidents", async (req, res) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({
        error: "redis client not available",
        redis: getRedisStatus(),
      });
    }

    const incident = sanitizeIncidentState(req.body && req.body.incident);
    const handoverSummary = normalizeText(req.body && req.body.handoverSummary, 20000);

    if (!hasIncidentContent(incident, handoverSummary)) {
      return res.status(400).json({
        error: "incident content is required",
      });
    }

    const now = new Date().toISOString();
    const item = buildIncidentItem(incident, handoverSummary);

    await redis.lPush(INCIDENT_LIST_KEY, JSON.stringify(item));
    await redis.lTrim(INCIDENT_LIST_KEY, 0, MAX_STORED_INCIDENTS - 1);

    console.log(JSON.stringify({
      type: "incident",
      event: "created",
      id: item.id,
      title: item.title,
      timestamp: now,
    }));

    res.status(201).json({
      incident: item,
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[Incidents] create failed:", err.message);
    res.status(500).json({
      error: err.message,
      redis: getRedisStatus(),
    });
  }
});

router.put("/api/incidents/:id", async (req, res) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({
        error: "redis client not available",
        redis: getRedisStatus(),
      });
    }

    const id = getIncidentId(req);
    const incident = sanitizeIncidentState(req.body && req.body.incident);
    const handoverSummary = normalizeText(req.body && req.body.handoverSummary, 20000);

    if (!id) {
      return res.status(400).json({ error: "incident id is required" });
    }

    if (!hasIncidentContent(incident, handoverSummary)) {
      return res.status(400).json({
        error: "incident content is required",
      });
    }

    const records = await readIncidentRecords(redis);
    const recordIndex = records.findIndex((item) => item.id === id);

    if (recordIndex === -1) {
      return res.status(404).json({ error: "incident not found" });
    }

    const item = buildIncidentItem(incident, handoverSummary, records[recordIndex]);
    records.splice(recordIndex, 1);
    records.unshift(item);
    await writeIncidentRecords(redis, records);

    console.log(JSON.stringify({
      type: "incident",
      event: "updated",
      id: item.id,
      title: item.title,
      timestamp: item.updatedAt,
    }));

    res.json({
      incident: item,
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[Incidents] update failed:", err.message);
    res.status(500).json({
      error: err.message,
      redis: getRedisStatus(),
    });
  }
});

router.patch("/api/incidents/:id/resolve", async (req, res) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({
        error: "redis client not available",
        redis: getRedisStatus(),
      });
    }

    const id = getIncidentId(req);
    if (!id) {
      return res.status(400).json({ error: "incident id is required" });
    }

    const records = await readIncidentRecords(redis);
    const recordIndex = records.findIndex((item) => item.id === id);

    if (recordIndex === -1) {
      return res.status(404).json({ error: "incident not found" });
    }

    const now = new Date().toISOString();
    const item = records[recordIndex];
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

    records.splice(recordIndex, 1, nextItem);
    await writeIncidentRecords(redis, records);

    console.log(JSON.stringify({
      type: "incident",
      event: "resolved",
      id: nextItem.id,
      title: nextItem.title,
      timestamp: now,
    }));

    res.json({
      incident: nextItem,
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[Incidents] resolve failed:", err.message);
    res.status(500).json({
      error: err.message,
      redis: getRedisStatus(),
    });
  }
});

router.delete("/api/incidents/:id", async (req, res) => {
  try {
    const redis = getRedis();
    if (!redis) {
      return res.status(500).json({
        error: "redis client not available",
        redis: getRedisStatus(),
      });
    }

    const id = getIncidentId(req);
    if (!id) {
      return res.status(400).json({ error: "incident id is required" });
    }

    const records = await readIncidentRecords(redis);
    const recordIndex = records.findIndex((item) => item.id === id);

    if (recordIndex === -1) {
      return res.status(404).json({ error: "incident not found" });
    }

    const [deleted] = records.splice(recordIndex, 1);
    await writeIncidentRecords(redis, records);

    console.log(JSON.stringify({
      type: "incident",
      event: "deleted",
      id,
      title: deleted.title,
      timestamp: new Date().toISOString(),
    }));

    res.json({
      deleted: true,
      id,
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[Incidents] delete failed:", err.message);
    res.status(500).json({
      error: err.message,
      redis: getRedisStatus(),
    });
  }
});

module.exports = router;
