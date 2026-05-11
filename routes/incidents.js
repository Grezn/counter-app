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
    const items = (await redis.lRange(INCIDENT_LIST_KEY, 0, limit - 1))
      .map(safeParseIncident)
      .filter(Boolean);

    res.json({
      incidents: items,
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
    const fields = incident.fields;
    const item = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      title: getIncidentTitle(fields),
      summary: getIncidentSummary(fields),
      severity: fields.severity || "",
      status: fields.status || "",
      customer: fields.customer || "",
      system: fields.system || "",
      startedAt: fields.startedAt || "",
      source: fields.source || "",
      incident,
      handoverSummary,
    };

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

module.exports = router;
