const express = require("express");

const router = express.Router();

const REQUIRED_CONFIG = [
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "JIRA_PROJECT_KEY",
];

function getJiraConfig() {
  const missing = REQUIRED_CONFIG.filter((name) => !process.env[name]);

  return {
    missing,
    baseUrl: String(process.env.JIRA_BASE_URL || "").replace(/\/+$/, ""),
    restBaseUrl: String(process.env.JIRA_REST_BASE_URL || "").replace(/\/+$/, ""),
    email: process.env.JIRA_EMAIL || "",
    apiToken: process.env.JIRA_API_TOKEN || "",
    projectKey: process.env.JIRA_PROJECT_KEY || "",
    issueTypeName: process.env.JIRA_ISSUE_TYPE || "交接事項",
    issueTypeId: process.env.JIRA_ISSUE_TYPE_ID || "",
    labels: process.env.JIRA_LABELS || "電話連絡,noc-oncall",
    defaultPriority: process.env.JIRA_DEFAULT_PRIORITY || "",
  };
}

function normalizeText(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? text.slice(0, maxLength - 1) + "..." : text;
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function getPriorityName(config, fields) {
  if (config.defaultPriority) return config.defaultPriority;

  switch (fields.severity) {
    case "Critical":
    case "重大":
    case "Service Impact":
    case "服務影響":
      return "High";
    case "Warning":
    case "提醒":
      return "Medium";
    case "Info":
    case "資訊":
      return "Low";
    default:
      return "";
  }
}

function getConfiguredLabels(config, fields) {
  const labels = config.labels
    .split(",")
    .map(normalizeLabel)
    .filter(Boolean);

  const severityLabel = normalizeLabel(fields.severity);
  if (severityLabel) labels.push(`sev-${severityLabel}`);

  return Array.from(new Set(labels));
}

function buildIssueSummary(fields) {
  const title = normalizeText(fields.title, "值班事件紀錄");
  const customer = normalizeText(fields.customer);
  const system = normalizeText(fields.system);
  const prefixParts = [customer, system].filter(Boolean);
  const prefix = prefixParts.length ? `[NOC] ${prefixParts.join(" / ")} - ` : "[NOC] ";

  return truncateText(prefix + title, 240);
}

function textNode(text, marks) {
  const node = {
    type: "text",
    text,
  };

  if (marks) node.marks = marks;
  return node;
}

function paragraph(text, marks) {
  const value = String(text || "");

  return {
    type: "paragraph",
    content: value ? [textNode(value, marks)] : [],
  };
}

function summaryToAdf(summary) {
  const lines = String(summary || "")
    .split(/\r?\n/)
    .slice(0, 350);
  const content = [
    paragraph("由 NOC 值班工作台建立", [{ type: "strong" }]),
    paragraph(""),
  ];

  lines.forEach((line) => {
    const trimmed = line.trim();
    const isSectionTitle = /^【.+】$/.test(trimmed);
    content.push(paragraph(line, isSectionTitle ? [{ type: "strong" }] : undefined));
  });

  if (content.length <= 2) {
    content.push(paragraph("未提供事件摘要"));
  }

  return {
    type: "doc",
    version: 1,
    content,
  };
}

function buildCreateIssuePayload(config, incident, handoverSummary) {
  const fields = incident.fields || {};
  const issueType = config.issueTypeId
    ? { id: config.issueTypeId }
    : { name: config.issueTypeName };
  const jiraFields = {
    project: {
      key: config.projectKey,
    },
    issuetype: issueType,
    summary: buildIssueSummary(fields),
    description: summaryToAdf(handoverSummary),
    labels: getConfiguredLabels(config, fields),
  };
  const priorityName = getPriorityName(config, fields);

  if (priorityName) {
    jiraFields.priority = { name: priorityName };
  }

  return { fields: jiraFields };
}

async function readJiraResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (err) {
    return { raw: text };
  }
}

router.get("/api/jira/status", (req, res) => {
  const config = getJiraConfig();

  res.json({
    configured: config.missing.length === 0,
    missing: config.missing,
    baseUrl: config.baseUrl,
    projectKey: config.projectKey,
    issueType: config.issueTypeId || config.issueTypeName,
  });
});

router.post("/api/jira/issues", async (req, res) => {
  try {
    const config = getJiraConfig();
    if (config.missing.length) {
      return res.status(503).json({
        error: "jira is not configured",
        missing: config.missing,
      });
    }

    if (!/^https:\/\/.+\.atlassian\.net$/.test(config.baseUrl)) {
      return res.status(400).json({
        error: "JIRA_BASE_URL must be an Atlassian Cloud site URL, for example https://example.atlassian.net",
      });
    }

    const restBaseUrl = config.restBaseUrl || `${config.baseUrl}/rest/api/3`;
    if (!/^https:\/\//.test(restBaseUrl)) {
      return res.status(400).json({
        error: "JIRA_REST_BASE_URL must start with https://",
      });
    }

    const incident = req.body && typeof req.body.incident === "object" ? req.body.incident : {};
    const handoverSummary = truncateText(req.body && req.body.handoverSummary, 28000);

    if (!normalizeText(handoverSummary)) {
      return res.status(400).json({
        error: "handover summary is required",
      });
    }

    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
    const jiraResponse = await fetch(`${restBaseUrl}/issue`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildCreateIssuePayload(config, incident, handoverSummary)),
    });
    const data = await readJiraResponse(jiraResponse);

    if (!jiraResponse.ok) {
      console.error("[Jira] create issue failed:", JSON.stringify({
        status: jiraResponse.status,
        errorMessages: data.errorMessages,
        errors: data.errors,
      }));

      return res.status(jiraResponse.status).json({
        error: "jira issue create failed",
        details: data,
      });
    }

    const issueUrl = `${config.baseUrl}/browse/${data.key}`;

    res.status(201).json({
      id: data.id,
      key: data.key,
      self: data.self,
      url: issueUrl,
    });
  } catch (err) {
    console.error("[Jira] create issue error:", err.message);
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
