(function initHandoverSummary(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CounterAppHandoverSummary = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createHandoverSummaryApi() {
  function normalizeText(value, fallback = "") {
    return String(value || "").trim() || fallback;
  }

  function valueOrDash(value) {
    return normalizeText(value, "-");
  }

  function line(label, value) {
    return `${label}：${valueOrDash(value)}`;
  }

  function formatDisplayDateTime(value) {
    return value ? String(value).replace("T", " ") : "-";
  }

  function normalizeTrackingStatus(status) {
    return normalizeText(status);
  }

  function canTrackingStatusSkipNextCheck(status) {
    const trackingStatus = normalizeTrackingStatus(status);
    return trackingStatus === "不需追蹤" || trackingStatus === "可結案";
  }

  function getServiceTypeDisplayMode(serviceType) {
    if (serviceType === "產品報修" || serviceType === "協助客戶報修") return "repair";
    if (serviceType === "AWS - 邀請組織") return "aws";
    if (serviceType === "其他") return "other";
    if (serviceType === "一般諮詢") return "general";
    return "empty";
  }

  function parseIncidentNotesTimeline(notes) {
    return String(notes || "")
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const match = item.match(/^(?:(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2})\s+)?(\d{1,2}:\d{2})(?:\s*[-|]\s*)?(.*)$/);
        if (!match) {
          return {
            time: "補充",
            text: item,
            hasTime: false,
          };
        }

        return {
          time: `${match[1] ? `${match[1]} ` : ""}${match[2]}`,
          text: match[3] ? match[3].trim() : item,
          hasTime: true,
        };
      });
  }

  function getLatestIncidentNoteText(notes) {
    const entries = parseIncidentNotesTimeline(notes);
    const latestEntry = entries.length ? entries[entries.length - 1] : null;
    if (!latestEntry) return "";

    return latestEntry.hasTime
      ? `${latestEntry.time} ${latestEntry.text}`.trim()
      : latestEntry.text;
  }

  function getEnabledKeys(map) {
    return Object.entries(map || {})
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key);
  }

  function getFollowupLines(followups, fields) {
    return getEnabledKeys(followups).map((key) => {
      if (key === "其他" && fields.followupOther) {
        return `其他：${fields.followupOther}`;
      }

      return key;
    });
  }

  function getHandoverSummaryChangeLines(fields, previousFields) {
    if (!previousFields) return [];

    return [
      ["status", "目前狀態"],
      ["impact", "影響範圍"],
      ["nextStep", "下一步"],
      ["trackingStatus", "追蹤狀態"],
      ["nextCheckAt", "下次確認"],
      ["notified", "已通知"],
      ["notes", "處理紀錄"],
    ]
      .filter(([fieldName]) => {
        const currentValue = normalizeText(fields[fieldName]);
        const previousValue = normalizeText(previousFields[fieldName]);
        return currentValue !== previousValue;
      })
      .map(([fieldName, label]) => {
        if (fieldName === "notes") {
          return line(label, getLatestIncidentNoteText(fields.notes) || fields.notes);
        }

        if (fieldName === "nextCheckAt" && canTrackingStatusSkipNextCheck(fields.trackingStatus)) {
          return line(label, "不需設定");
        }

        if (fieldName === "nextCheckAt") {
          return line(label, formatDisplayDateTime(fields[fieldName]));
        }

        return line(label, fields[fieldName]);
      });
  }

  function getReportLines(fields, radios, followups) {
    const serviceMode = getServiceTypeDisplayMode(radios.serviceType);
    const supplementByServiceMode = {
      repair: [
        ["產品名稱", fields.productName],
        ["合約編號", fields.contractId],
        ["產品型號", fields.model],
        ["產品序號", fields.serial],
        ["經銷商名稱", fields.dealer],
        ["報修對象", fields.repairTarget],
        ["負責業務 / 工程師", fields.owner],
        ["聯繫方式 / 稱呼", fields.contactMethod],
        ["是否為客戶", radios.isCustomer],
      ],
      aws: [
        ["產品名稱", fields.productName],
        ["負責業務 / 工程師", fields.owner],
        ["聯繫方式 / 稱呼", fields.contactMethod],
        ["是否為客戶", radios.isCustomer],
      ],
      other: [
        ["負責業務 / 工程師", fields.owner],
        ["聯繫方式 / 稱呼", fields.contactMethod],
        ["是否為客戶", radios.isCustomer],
      ],
      general: [],
      empty: [],
    };
    const followupLines = getFollowupLines(followups, fields);
    const followupText = followupLines.length ? followupLines.join("、") : "-";

    return [
      ...(supplementByServiceMode[serviceMode] || []),
      ["後續處理方式", followupText],
      ["其他補充", fields.extraInfo],
    ]
      .filter(([, value]) => valueOrDash(value) !== "-")
      .map(([label, value]) => line(label, value));
  }

  function buildHandoverSummary(state, options = {}) {
    const incidentState = state || {};
    const fields = incidentState.fields || {};
    const radios = incidentState.radios || {};
    const followups = incidentState.followups || {};
    const mode = options.mode || "full";
    const serviceType = radios.serviceType === "其他" && fields.serviceTypeOther
      ? `其他：${fields.serviceTypeOther}`
      : (radios.serviceType || "-");
    const nextCheckText = canTrackingStatusSkipNextCheck(fields.trackingStatus)
      ? "不需設定"
      : formatDisplayDateTime(fields.nextCheckAt);
    const doneChecks = getEnabledKeys(incidentState.checks);
    const reportLines = getReportLines(fields, radios, followups);
    const headline = `[${valueOrDash(fields.severity)} / ${valueOrDash(fields.status)}] ${valueOrDash(fields.title)}`;

    if (mode === "compact") {
      return [
        "【交班摘要】",
        line("主旨", fields.title),
        line("狀態", fields.status),
        line("影響", fields.impact),
        line("下一步", fields.nextStep),
        line("追蹤狀態", fields.trackingStatus),
        line("下次確認", nextCheckText),
      ].join("\n");
    }

    if (mode === "update") {
      const changeLines = getHandoverSummaryChangeLines(fields, options.previousFields);
      const updateLines = changeLines.length
        ? changeLines
        : [
          line("最新處理", getLatestIncidentNoteText(fields.notes) || fields.notes),
          line("下一步", fields.nextStep),
          line("追蹤狀態", fields.trackingStatus),
          line("下次確認", nextCheckText),
        ];

      return [
        "【事件更新】",
        headline,
        ...updateLines,
      ].join("\n");
    }

    return [
      "【接手重點】",
      headline,
      line("事件時間", formatDisplayDateTime(fields.startedAt)),
      line("客戶 / 單位", fields.customer),
      line("系統 / 設備", fields.system),
      line("來源", fields.source),
      line("服務類型", serviceType),
      "",
      "【問題 / 影響】",
      line("問題描述", fields.problemDescription),
      line("影響範圍", fields.impact),
      "",
      "【接手動作】",
      line("下一步", fields.nextStep),
      line("追蹤狀態", fields.trackingStatus),
      line("下次確認", nextCheckText),
      line("接手人員", fields.handoverOwner),
      line("已通知", fields.notified),
      "",
      "【處理紀錄】",
      valueOrDash(fields.notes),
      "",
      "【已完成檢查】",
      doneChecks.length ? doneChecks.join("、") : "-",
      "",
      "【報修補充】",
      reportLines.length ? reportLines.join("\n") : "-",
    ].join("\n");
  }

  return {
    buildHandoverSummary,
    canTrackingStatusSkipNextCheck,
    getLatestIncidentNoteText,
    parseIncidentNotesTimeline,
  };
});
