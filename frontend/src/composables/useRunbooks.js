import { computed, onMounted, reactive } from "vue";
import { getRunbooks } from "../api/runbooks";

export function normalizeRunbookText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getSearchableText(runbook) {
  return [
    runbook.title,
    runbook.summary,
    runbook.severity,
    ...toArray(runbook.triggers),
    ...toArray(runbook.dutyRules),
    ...toArray(runbook.replyRules),
    ...toArray(runbook.ignoreRules),
    ...toArray(runbook.firstChecks),
    ...toArray(runbook.steps),
    ...toArray(runbook.escalateWhen),
    ...toArray(runbook.contacts),
    ...toArray(runbook.mailRecipients),
    ...toArray(runbook.extraSections).flatMap((section) => [
      section.title,
      ...toArray(section.items),
      ...toArray(section.copyGroups).flatMap((group) => [
        group.label,
        group.copyLabel,
        group.text,
      ]),
    ]),
  ].join(" ").toLowerCase();
}

export function getRunbookCopyGroupButtonLabel(group) {
  const copyLabel = String(group && group.copyLabel ? group.copyLabel : "").trim();
  if (copyLabel) return copyLabel;

  const label = String(group && group.label ? group.label : "").trim();
  const shortLabel = label.replace(/\s*Team$/i, "");

  return shortLabel ? `複製 ${shortLabel}` : "複製";
}

export function getRunbookLinkButtonLabel(link) {
  const label = String(link && link.label ? link.label : "").trim();

  if (!label) return "開啟連結";
  if (/^開啟/.test(label)) return label;
  if (label === "Subnet 登入頁面") return "開啟 Subnet";

  return /^[A-Za-z0-9]/.test(label) ? `開啟 ${label}` : `開啟${label}`;
}

export function getRunbookListItemClass(item) {
  const normalizedItem = String(item || "").trim();

  if (normalizedItem.startsWith("※") || normalizedItem.startsWith("⚠️")) {
    return "runbook-note-line";
  }

  if (
    /^\d+\.\s/.test(normalizedItem)
    || /^Step\s*\d+\./i.test(normalizedItem)
    || /^[①②③✔✘✓ＯＸX→•]/.test(normalizedItem)
    || /^[是否]\s*->/.test(normalizedItem)
  ) {
    return "runbook-numbered-line";
  }

  return "";
}

function getRunbookLinkAliases(runbook) {
  const aliases = [];
  const seen = new Set();

  toArray(runbook.links).forEach((link) => {
    const candidates = [link.label];

    if (link.label === "iTop") {
      candidates.push("ITop", "ITOP");
    }

    if (link.href && link.href.includes("subnet.min.io")) {
      candidates.push("MINIO Subnet", "MinIO Subnet", "Subnet 登入頁面", "Subnet");
    }

    if (link.label === "原 SOP") {
      candidates.push("原 SOP");
    }

    if (link.label === "通話記錄用表格") {
      candidates.push("通話記錄用表格", "通話記錄表格", "紀錄表單", "記錄表單");
    }

    if (link.label === "Akamai SE 分工表 & 合約表") {
      candidates.push("Akamai SE 分工表", "SE 分工表", "SE分工表", "Akamai 合約表", "合約表");
    }

    if (link.label === "Akamai 流程問題意見回覆表") {
      candidates.push("流程問題意見回覆表", "MSP 維運問題紀錄");
    }

    candidates.forEach((candidate) => {
      const alias = String(candidate || "").trim();
      const key = alias.toLowerCase();

      if (!alias || seen.has(key)) return;

      seen.add(key);
      aliases.push({
        alias,
        aliasLower: key,
        href: link.href,
      });
    });
  });

  return aliases.sort((a, b) => b.alias.length - a.alias.length);
}

export function getRunbookLinkedSegments(text, runbook) {
  const value = String(text || "");
  const valueLower = value.toLowerCase();
  const aliases = getRunbookLinkAliases(runbook);
  const segments = [];
  let cursor = 0;

  while (cursor < value.length) {
    let nextMatch = null;

    aliases.forEach((alias) => {
      const index = valueLower.indexOf(alias.aliasLower, cursor);

      if (index === -1) return;
      if (!nextMatch || index < nextMatch.index || (
        index === nextMatch.index && alias.alias.length > nextMatch.alias.alias.length
      )) {
        nextMatch = { alias, index };
      }
    });

    if (!nextMatch) {
      segments.push({ text: value.slice(cursor), href: "" });
      break;
    }

    if (nextMatch.index > cursor) {
      segments.push({ text: value.slice(cursor, nextMatch.index), href: "" });
    }

    segments.push({
      text: value.slice(nextMatch.index, nextMatch.index + nextMatch.alias.alias.length),
      href: nextMatch.alias.href,
    });

    cursor = nextMatch.index + nextMatch.alias.alias.length;
  }

  return segments.length ? segments : [{ text: value, href: "" }];
}

export async function copyTextToClipboard(text) {
  const value = Array.isArray(text) ? text.join("\n") : String(text || "");

  if (navigator.clipboard && window.isSecureContext !== false) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back to the textarea path below when browser permissions block clipboard.writeText().
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export function useRunbooks() {
  const state = reactive({
    activeCategory: "all",
    categories: [],
    error: "",
    keyword: "",
    loading: true,
    runbooks: [],
    version: "",
  });

  const categoryOptions = computed(() => [
    { id: "all", name: "全部" },
    ...state.categories,
  ]);

  const filteredRunbooks = computed(() => {
    const keyword = state.keyword.trim().toLowerCase();

    return state.runbooks.filter((runbook) => {
      const categoryMatched = state.activeCategory === "all"
        || runbook.category === state.activeCategory;

      if (!categoryMatched) return false;
      if (!keyword) return true;

      return getSearchableText(runbook).includes(keyword);
    });
  });

  const metaText = computed(() => {
    if (state.loading) return "Loading...";
    if (state.error) return "Unavailable";
    return `v${state.version || "unknown"} / ${state.runbooks.length} items`;
  });

  function getCategoryName(categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);
    return category ? category.name : categoryId;
  }

  function setActiveCategory(categoryId) {
    state.activeCategory = categoryId || "all";
  }

  async function loadRunbooks() {
    state.loading = true;
    state.error = "";

    try {
      const data = await getRunbooks();

      state.categories = toArray(data.categories);
      state.runbooks = toArray(data.runbooks);
      state.version = data.version || "";
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
    }
  }

  function applyRunbookDraft(runbook) {
    const fn = window.applyRunbookToIncidentDraft;

    if (typeof fn !== "function") {
      console.warn("Runbook draft handler is not ready yet.");
      return;
    }

    fn({
      ...runbook,
      categoryName: getCategoryName(runbook.category),
    });
  }

  onMounted(loadRunbooks);

  return {
    applyRunbookDraft,
    categoryOptions,
    filteredRunbooks,
    getCategoryName,
    loadRunbooks,
    metaText,
    setActiveCategory,
    state,
  };
}
