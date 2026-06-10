const REQUIRED_CONFIG = [
  "JIRA_BASE_URL",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "JIRA_PROJECT_KEY",
];

class JiraServiceError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.name = "JiraServiceError";
    this.status = status;
    this.data = data;
  }
}

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

function getJiraStatus() {
  const config = getJiraConfig();

  return {
    configured: config.missing.length === 0,
    missing: config.missing,
    baseUrl: config.baseUrl,
    projectKey: config.projectKey,
    issueType: config.issueTypeId || config.issueTypeName,
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

  const severity = String(fields.severity || "").toLowerCase();
  if (severity.includes("critical") || severity.includes("重大")) return "High";
  if (severity.includes("service impact") || severity.includes("服務影響")) return "High";
  if (severity.includes("warning") || severity.includes("警告") || severity.includes("提醒")) return "Medium";
  if (severity.includes("info") || severity.includes("資訊")) return "Low";

  return "";
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
  } catch {
    return { raw: text };
  }
}

function validateJiraConfig(config) {
  if (config.missing.length) {
    throw new JiraServiceError(503, "jira is not configured", {
      missing: config.missing,
    });
  }

  if (!/^https:\/\/.+\.atlassian\.net$/.test(config.baseUrl)) {
    throw new JiraServiceError(
      400,
      "JIRA_BASE_URL must be an Atlassian Cloud site URL, for example https://example.atlassian.net",
    );
  }

  const restBaseUrl = config.restBaseUrl || `${config.baseUrl}/rest/api/3`;
  if (!/^https:\/\//.test(restBaseUrl)) {
    throw new JiraServiceError(400, "JIRA_REST_BASE_URL must start with https://");
  }

  return restBaseUrl;
}

function getCreateIssueInput(body) {
  const incident = body && typeof body.incident === "object" ? body.incident : {};
  const handoverSummary = truncateText(body && body.handoverSummary, 28000);

  if (!normalizeText(handoverSummary)) {
    throw new JiraServiceError(400, "handover summary is required");
  }

  return {
    handoverSummary,
    incident,
  };
}

async function createJiraIssue(body) {
  const config = getJiraConfig();
  const restBaseUrl = validateJiraConfig(config);
  const { incident, handoverSummary } = getCreateIssueInput(body);
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  const jiraResponse = await fetch(`${restBaseUrl}/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
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

    throw new JiraServiceError(jiraResponse.status, "jira issue create failed", {
      details: data,
    });
  }

  return {
    id: data.id,
    key: data.key,
    self: data.self,
    url: `${config.baseUrl}/browse/${data.key}`,
  };
}

module.exports = {
  JiraServiceError,
  createJiraIssue,
  getJiraStatus,
};
