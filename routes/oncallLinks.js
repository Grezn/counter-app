const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const redisSvc = require("../services/redis");

const router = express.Router();
const DEFAULT_LINKS_FILE = path.join(__dirname, "../data/oncall-links.json");
const REDIS_KEY = process.env.ONCALL_LINKS_REDIS_KEY || "config:oncall_links";
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

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

function getAdminToken() {
  // 預設沿用 RESET_TOKEN；如果之後想分權，可以另外設定 ONCALL_LINKS_ADMIN_TOKEN。
  return process.env.ONCALL_LINKS_ADMIN_TOKEN || process.env.RESET_TOKEN || "";
}

function isAdminAuthorized(req) {
  const expected = getAdminToken();
  if (!expected) return false;

  const provided = req.headers["x-oncall-token"] || req.headers["x-reset-token"];
  return typeof provided === "string" && provided === expected;
}

function normalizeText(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function getTodayVersion() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeId(value, fallback) {
  const id = normalizeText(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return id || fallback;
}

function sanitizeUrl(value) {
  const href = normalizeText(value);
  if (!href) throw new Error("link href is required");
  if (href.length > 2048) throw new Error("link href is too long");

  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    throw new Error(`invalid link url: ${href}`);
  }

  if (!ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`unsupported link protocol: ${parsed.protocol}`);
  }

  return href;
}

function normalizeLink(link, index) {
  if (!link || typeof link !== "object" || Array.isArray(link)) {
    throw new Error("link must be an object");
  }

  return {
    label: normalizeText(link.label, `入口 ${index + 1}`).slice(0, 80),
    href: sanitizeUrl(link.href),
  };
}

function normalizeLinks(value, maxItems, fieldName) {
  if (!Array.isArray(value)) return [];
  if (value.length > maxItems) {
    throw new Error(`${fieldName} cannot exceed ${maxItems} links`);
  }

  return value.map(normalizeLink);
}

function normalizeGroup(group, index) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    throw new Error("group must be an object");
  }

  const id = normalizeId(group.id, `group-${index + 1}`);

  return {
    id,
    title: normalizeText(group.title, `入口群組 ${index + 1}`).slice(0, 80),
    links: normalizeLinks(group.links, 30, `groups.${id}.links`),
  };
}

function normalizeChecklist(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > 12) throw new Error("checklist cannot exceed 12 items");

  return value
    .map((item) => normalizeText(item).slice(0, 160))
    .filter(Boolean);
}

function normalizeConfig(input, options = {}) {
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? input
    : {};
  const source = raw.config && typeof raw.config === "object" && !Array.isArray(raw.config)
    ? raw.config
    : raw;
  const groups = Array.isArray(source.groups)
    ? source.groups.slice(0, 12).map(normalizeGroup)
    : [];

  return {
    version: normalizeText(source.version, getTodayVersion()).slice(0, 40),
    note: normalizeText(source.note).slice(0, 500),
    updatedAt: options.updatedAt || normalizeText(source.updatedAt),
    coreLinks: normalizeLinks(source.coreLinks, 20, "coreLinks"),
    groups,
    checklist: normalizeChecklist(source.checklist),
  };
}

async function loadDefaultConfig() {
  const raw = await fs.readFile(DEFAULT_LINKS_FILE, "utf8");
  return normalizeConfig(JSON.parse(raw));
}

async function loadSavedConfig() {
  const redis = getRedis();
  if (!redis || !redis.isReady) return null;

  const raw = await redis.get(REDIS_KEY);
  if (!raw) return null;

  return normalizeConfig(JSON.parse(raw));
}

router.get("/api/oncall-links", async (req, res) => {
  try {
    const defaultConfig = await loadDefaultConfig();
    let config = defaultConfig;
    let source = "default";

    try {
      const savedConfig = await loadSavedConfig();
      if (savedConfig) {
        config = savedConfig;
        source = "redis";
      }
    } catch (err) {
      console.error("[OncallLinks] saved config ignored:", err.message);
    }

    res.json({
      ...config,
      source,
      redis: getRedisStatus(),
      editable: Boolean(getAdminToken()),
    });
  } catch (err) {
    console.error("[OncallLinks] load failed:", err.message);
    res.status(500).json({
      error: "on-call links unavailable",
      redis: getRedisStatus(),
    });
  }
});

router.put("/api/oncall-links", async (req, res) => {
  try {
    if (!getAdminToken()) {
      return res.status(503).json({
        error: "on-call links admin token is not configured",
      });
    }

    if (!isAdminAuthorized(req)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const redis = getRedis();
    if (!redis || !redis.isReady) {
      return res.status(503).json({
        error: "redis is required for online updates",
        redis: getRedisStatus(),
      });
    }

    const config = normalizeConfig(req.body, {
      updatedAt: new Date().toISOString(),
    });

    await redis.set(REDIS_KEY, JSON.stringify(config));

    res.json({
      ...config,
      source: "redis",
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[OncallLinks] save failed:", err.message);
    res.status(400).json({
      error: err.message,
      redis: getRedisStatus(),
    });
  }
});

router.delete("/api/oncall-links", async (req, res) => {
  try {
    if (!getAdminToken()) {
      return res.status(503).json({
        error: "on-call links admin token is not configured",
      });
    }

    if (!isAdminAuthorized(req)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const redis = getRedis();
    if (!redis || !redis.isReady) {
      return res.status(503).json({
        error: "redis is required for online updates",
        redis: getRedisStatus(),
      });
    }

    await redis.del(REDIS_KEY);
    const config = await loadDefaultConfig();

    res.json({
      ...config,
      source: "default",
      redis: getRedisStatus(),
    });
  } catch (err) {
    console.error("[OncallLinks] reset failed:", err.message);
    res.status(400).json({
      error: err.message,
      redis: getRedisStatus(),
    });
  }
});

module.exports = router;
