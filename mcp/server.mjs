#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_APP_BASE_URL = process.env.COUNTER_APP_BASE_URL || process.env.APP_BASE_URL || "http://127.0.0.1:3000";
const DEFAULT_TIMEOUT_MS = Number(process.env.MCP_APP_TIMEOUT_MS || 6000);

const DOC_RESOURCES = [
  {
    name: "readme",
    uri: "counter-app://docs/readme",
    title: "README",
    description: "Project overview, environment variables, and deployment notes.",
    file: "README.md",
    mimeType: "text/markdown",
  },
  {
    name: "operations",
    uri: "counter-app://docs/operations",
    title: "Operations Guide",
    description: "Production operations and recovery procedures.",
    file: "docs/operations.md",
    mimeType: "text/markdown",
  },
  {
    name: "code-walkthrough",
    uri: "counter-app://docs/code-walkthrough",
    title: "Code Walkthrough",
    description: "Application module guide for maintainers.",
    file: "docs/code-walkthrough.md",
    mimeType: "text/markdown",
  },
  {
    name: "project-inventory",
    uri: "counter-app://docs/project-inventory",
    title: "Project Inventory",
    description: "AWS, app, and repository inventory.",
    file: "docs/project-inventory.md",
    mimeType: "text/markdown",
  },
  {
    name: "runbooks-json",
    uri: "counter-app://data/runbooks",
    title: "Runbooks JSON",
    description: "Raw runbook data rendered by /api/runbooks.",
    file: "data/runbooks.json",
    mimeType: "application/json",
  },
  {
    name: "mcp-config-example",
    uri: "counter-app://mcp/config-example",
    title: "MCP Config Example",
    description: "Example stdio client configuration for this project MCP server.",
    file: ".mcp.example.json",
    mimeType: "application/json",
  },
];

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text", text }],
  };
}

function normalizeText(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function resolveProjectPath(relativePath) {
  const resolved = path.resolve(PROJECT_ROOT, relativePath);
  const rootRelativePath = path.relative(PROJECT_ROOT, resolved);
  if (rootRelativePath.startsWith("..") || path.isAbsolute(rootRelativePath)) {
    throw new Error(`Refusing to read outside project root: ${relativePath}`);
  }
  return resolved;
}

async function readProjectFile(relativePath) {
  return readFile(resolveProjectPath(relativePath), "utf8");
}

async function loadRunbookData() {
  return JSON.parse(await readProjectFile("data/runbooks.json"));
}

function searchableRunbookText(runbook) {
  return [
    runbook.id,
    runbook.category,
    runbook.title,
    runbook.summary,
    runbook.severity,
    ...(runbook.triggers || []),
    ...(runbook.dutyRules || []),
    ...(runbook.replyRules || []),
    ...(runbook.ignoreRules || []),
    ...(runbook.firstChecks || []),
    ...(runbook.steps || []),
    ...(runbook.escalateWhen || []),
    ...(runbook.contacts || []),
    ...(runbook.mailRecipients || []),
    ...((runbook.extraSections || []).flatMap((section) => [
      section.title,
      ...(section.items || []),
      ...((section.copyGroups || []).flatMap((group) => [
        group.label,
        group.copyLabel,
        group.text,
      ])),
    ])),
  ].join(" ").toLowerCase();
}

function summarizeRunbook(runbook) {
  return {
    id: runbook.id,
    category: runbook.category,
    title: runbook.title,
    summary: runbook.summary,
    severity: runbook.severity,
    linkLabels: (runbook.links || []).map((link) => link.label).filter(Boolean),
    sectionTitles: (runbook.extraSections || []).map((section) => section.title).filter(Boolean),
  };
}

function filterRunbooks(data, options = {}) {
  const keyword = normalizeText(options.q).toLowerCase();
  const category = normalizeText(options.category).toLowerCase();
  const limit = clampInteger(options.limit, 1, 50, 10);

  return (data.runbooks || [])
    .filter((runbook) => {
      const categoryMatched = !category || normalizeText(runbook.category).toLowerCase() === category;
      const keywordMatched = !keyword || searchableRunbookText(runbook).includes(keyword);
      return categoryMatched && keywordMatched;
    })
    .slice(0, limit);
}

function getAppUrl(endpoint, appBaseUrl = DEFAULT_APP_BASE_URL) {
  return new URL(endpoint, appBaseUrl.endsWith("/") ? appBaseUrl : `${appBaseUrl}/`);
}

async function appRequest(endpoint, options = {}) {
  const timeoutMs = clampInteger(options.timeoutMs, 1000, 30000, DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getAppUrl(endpoint, options.appBaseUrl), {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = raw;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = raw;
    }

    if (!response.ok) {
      const message = typeof data === "object" && data && data.error ? data.error : response.statusText;
      const error = new Error(message || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return {
      status: response.status,
      data,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${endpoint}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function buildHandoverSummary(fields) {
  const valueOrDash = (value) => normalizeText(value, "-");
  const line = (label, value) => `${label}: ${valueOrDash(value)}`;
  const headline = `[${valueOrDash(fields.severity)} / ${valueOrDash(fields.status)}] ${valueOrDash(fields.title)}`;

  return [
    "【接手重點】",
    headline,
    line("事件時間", fields.startedAt),
    line("客戶 / 單位", fields.customer),
    line("系統 / 設備", fields.system),
    line("來源", fields.source),
    "",
    "【問題 / 影響】",
    line("問題描述", fields.problemDescription),
    line("影響範圍", fields.impact),
    "",
    "【接手動作】",
    line("下一步", fields.nextStep),
    line("追蹤狀態", fields.trackingStatus),
    line("下次確認", fields.nextCheckAt),
    line("接手人員", fields.handoverOwner),
    line("已通知", fields.notified),
    "",
    "【處理紀錄】",
    valueOrDash(fields.notes),
  ].join("\n");
}

function buildIncidentPayload(args) {
  const fields = {
    title: normalizeText(args.title),
    severity: normalizeText(args.severity),
    status: normalizeText(args.status),
    customer: normalizeText(args.customer),
    system: normalizeText(args.system),
    source: normalizeText(args.source),
    startedAt: normalizeText(args.startedAt),
    problemDescription: normalizeText(args.problemDescription),
    impact: normalizeText(args.impact),
    nextStep: normalizeText(args.nextStep),
    trackingStatus: normalizeText(args.trackingStatus),
    nextCheckAt: normalizeText(args.nextCheckAt),
    handoverOwner: normalizeText(args.handoverOwner),
    notified: normalizeText(args.notified),
    notes: normalizeText(args.notes),
  };

  const incident = {
    fields,
    checks: Object.fromEntries((args.checks || []).map((item) => [item, true])),
    radios: args.serviceType ? { serviceType: args.serviceType } : {},
    followups: Object.fromEntries((args.followups || []).map((item) => [item, true])),
  };

  return {
    incident,
    handoverSummary: normalizeText(args.handoverSummary) || buildHandoverSummary(fields),
  };
}

const server = new McpServer({
  name: "counter-app",
  version: "1.0.0",
  websiteUrl: "https://github.com/Grezn/counter-app",
});

server.registerTool("app_status", {
  title: "App Status",
  description: "Check /health, /ready, /whoami, and Jira configuration through the running Express app.",
  inputSchema: {
    appBaseUrl: z.string().url().optional().describe("Base URL for the running app. Defaults to COUNTER_APP_BASE_URL or http://127.0.0.1:3000."),
  },
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async ({ appBaseUrl }) => {
  const endpoints = ["/health", "/ready", "/whoami", "/api/jira/status"];
  const results = await Promise.allSettled(endpoints.map((endpoint) => appRequest(endpoint, { appBaseUrl })));

  return textResult({
    appBaseUrl: appBaseUrl || DEFAULT_APP_BASE_URL,
    checks: Object.fromEntries(endpoints.map((endpoint, index) => {
      const result = results[index];
      return [
        endpoint,
        result.status === "fulfilled"
          ? result.value
          : {
            ok: false,
            error: result.reason.message,
            status: result.reason.status,
            data: result.reason.data,
          },
      ];
    })),
  });
});

server.registerTool("search_runbooks", {
  title: "Search Runbooks",
  description: "Search local runbook data by keyword and optional category.",
  inputSchema: {
    q: z.string().optional().describe("Keyword to search across runbook titles, sections, contacts, and copy groups."),
    category: z.string().optional().describe("Runbook category id, such as akamai, minio, purestorage, cycraft, or dell-server-storage."),
    limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of results."),
    includeDetails: z.boolean().default(false).describe("Return full matched runbook objects instead of summaries."),
  },
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async ({ q = "", category = "", limit = 10, includeDetails = false }) => {
  const data = await loadRunbookData();
  const matches = filterRunbooks(data, { q, category, limit });

  return textResult({
    version: data.version,
    total: data.runbooks.length,
    filtered: matches.length,
    categories: data.categories,
    runbooks: includeDetails ? matches : matches.map(summarizeRunbook),
  });
});

server.registerTool("get_runbook", {
  title: "Get Runbook",
  description: "Read one full runbook by id.",
  inputSchema: {
    id: z.string().min(1).describe("Runbook id, for example akamai-cdn-aap-linode-eaa."),
  },
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async ({ id }) => {
  const data = await loadRunbookData();
  const runbook = (data.runbooks || []).find((item) => item.id === id);

  if (!runbook) {
    return {
      ...textResult({ error: "runbook not found", id }),
      isError: true,
    };
  }

  return textResult({
    version: data.version,
    runbook,
  });
});

server.registerTool("list_incidents", {
  title: "List Incidents",
  description: "List saved incident records through the running app API.",
  inputSchema: {
    view: z.enum(["open", "all"]).default("open").describe("Show unresolved incidents or all incidents."),
    limit: z.number().int().min(1).max(50).default(10),
    appBaseUrl: z.string().url().optional(),
  },
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async ({ view = "open", limit = 10, appBaseUrl }) => {
  const params = new URLSearchParams({ view, limit: String(limit) });
  const result = await appRequest(`/api/incidents?${params.toString()}`, { appBaseUrl });
  return textResult(result.data);
});

server.registerTool("save_incident", {
  title: "Save Incident",
  description: "Create or update an incident record through the running app API. Defaults to dryRun=true.",
  inputSchema: {
    title: z.string().min(1).describe("One-line incident title."),
    status: z.string().optional(),
    severity: z.string().optional(),
    customer: z.string().optional(),
    system: z.string().optional(),
    source: z.string().optional(),
    startedAt: z.string().optional().describe("Incident start time; ISO-like strings work best."),
    problemDescription: z.string().optional(),
    impact: z.string().optional(),
    nextStep: z.string().optional(),
    trackingStatus: z.string().optional(),
    nextCheckAt: z.string().optional(),
    handoverOwner: z.string().optional(),
    notified: z.string().optional(),
    notes: z.string().optional(),
    serviceType: z.string().optional(),
    checks: z.array(z.string()).default([]),
    followups: z.array(z.string()).default([]),
    handoverSummary: z.string().optional().describe("Optional full summary. If omitted, a basic summary is generated."),
    updateId: z.string().optional().describe("Existing incident id to update. Omit to create a new record."),
    dryRun: z.boolean().default(true).describe("When true, return the payload without writing to the app."),
    appBaseUrl: z.string().url().optional(),
  },
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  const payload = buildIncidentPayload(args);

  if (args.dryRun !== false) {
    return textResult({
      dryRun: true,
      endpoint: args.updateId ? `/api/incidents/${args.updateId}` : "/api/incidents",
      payload,
    });
  }

  const endpoint = args.updateId ? `/api/incidents/${encodeURIComponent(args.updateId)}` : "/api/incidents";
  const result = await appRequest(endpoint, {
    method: args.updateId ? "PUT" : "POST",
    body: payload,
    appBaseUrl: args.appBaseUrl,
  });

  return textResult(result.data);
});

server.registerTool("get_weather_snapshot", {
  title: "Get Weather Snapshot",
  description: "Read the local weather endpoint through the running app API.",
  inputSchema: {
    locationName: z.string().optional().describe("Manual Taiwan location, for example 新北市 蘆洲區."),
    lat: z.number().optional(),
    lon: z.number().optional(),
    refresh: z.boolean().default(false),
    appBaseUrl: z.string().url().optional(),
  },
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async ({ locationName, lat, lon, refresh = false, appBaseUrl }) => {
  const params = new URLSearchParams();
  if (locationName) {
    params.set("locationName", locationName);
    params.set("manual", "1");
  }
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    params.set("lat", Number(lat).toFixed(5));
    params.set("lon", Number(lon).toFixed(5));
  }
  if (refresh) params.set("refresh", "1");

  const query = params.toString() ? `?${params.toString()}` : "";
  const result = await appRequest(`/api/weather/local${query}`, { appBaseUrl });
  return textResult(result.data);
});

DOC_RESOURCES.forEach((resource) => {
  server.registerResource(resource.name, resource.uri, {
    title: resource.title,
    description: resource.description,
    mimeType: resource.mimeType,
  }, async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: resource.mimeType,
      text: await readProjectFile(resource.file),
    }],
  }));
});

server.registerPrompt("draft_handover", {
  title: "Draft Handover",
  description: "Draft a handover summary from an incident brief and optional runbook hint.",
  argsSchema: {
    incidentBrief: z.string().min(1),
    runbookHint: z.string().optional(),
  },
}, async ({ incidentBrief, runbookHint = "" }) => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: [
        "Use the counter-app runbook style to draft a concise Traditional Chinese handover summary.",
        "Keep sections focused on current status, impact, next step, tracking status, next check time, notifications, and notes.",
        runbookHint ? `Relevant runbook hint: ${runbookHint}` : "",
        "",
        `Incident brief:\n${incidentBrief}`,
      ].filter(Boolean).join("\n"),
    },
  }],
}));

server.registerPrompt("develop_dashboard_change", {
  title: "Develop Dashboard Change",
  description: "Plan and implement a safe change for the MSP dashboard.",
  argsSchema: {
    changeRequest: z.string().min(1),
  },
}, async ({ changeRequest }) => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: [
        "Use the counter-app project conventions.",
        "Read counter-app://docs/code-walkthrough and counter-app://docs/operations if the change touches routes, Redis, Docker, or deployment.",
        "Keep secrets out of frontend code and prefer existing Express route patterns.",
        "",
        `Change request:\n${changeRequest}`,
      ].join("\n"),
    },
  }],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("counter-app MCP server running on stdio");
}

main().catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
