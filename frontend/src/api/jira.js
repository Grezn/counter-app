import { ApiRequestError, requestJson } from "./client";

const JIRA_ISSUES_PATH = "/api/jira/issues";

export function formatJiraCreateError(data = {}) {
  if (Array.isArray(data.missing) && data.missing.length) {
    return `Jira 尚未設定：${data.missing.join("、")}`;
  }

  const details = data.details;
  const messages = [];

  if (details && Array.isArray(details.errorMessages)) {
    messages.push(...details.errorMessages);
  }

  if (details && details.errors) {
    messages.push(...Object.values(details.errors));
  }

  return messages.length ? messages.join("；") : data.error || "建立 Jira 小卡失敗";
}

export async function createJiraIssue({ incident, handoverSummary }) {
  try {
    return await requestJson(JIRA_ISSUES_PATH, {
      method: "POST",
      json: {
        incident,
        handoverSummary,
      },
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw new Error(formatJiraCreateError(error.data));
    }

    throw error;
  }
}
