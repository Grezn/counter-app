const fs = require("fs/promises");
const path = require("path");

const RUNBOOKS_FILE = path.join(__dirname, "../data/runbooks.json");

function normalizeQueryText(value) {
  return String(value || "").trim().toLowerCase();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getSearchableRunbookText(runbook) {
  return [
    runbook.id,
    runbook.category,
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

function hasKeyword(runbook, keyword) {
  if (!keyword) return true;
  return getSearchableRunbookText(runbook).includes(keyword);
}

async function loadRunbookData() {
  const raw = await fs.readFile(RUNBOOKS_FILE, "utf8");
  const data = JSON.parse(raw);

  return {
    version: data.version || "unknown",
    note: data.note || "",
    categories: toArray(data.categories),
    runbooks: toArray(data.runbooks),
  };
}

function filterRunbooks(data, options = {}) {
  const category = normalizeQueryText(options.category);
  const keyword = normalizeQueryText(options.q);
  const limit = Number.parseInt(options.limit, 10);
  const hasLimit = Number.isFinite(limit) && limit > 0;

  const filtered = data.runbooks.filter((runbook) => {
    const categoryMatched = !category || normalizeQueryText(runbook.category) === category;
    return categoryMatched && hasKeyword(runbook, keyword);
  });

  return hasLimit ? filtered.slice(0, limit) : filtered;
}

async function listRunbooks(query = {}) {
  const data = await loadRunbookData();
  const runbooks = filterRunbooks(data, query);

  return {
    ...data,
    runbooks,
    total: data.runbooks.length,
    filtered: runbooks.length,
  };
}

function summarizeRunbook(runbook) {
  return {
    id: runbook.id,
    category: runbook.category,
    title: runbook.title,
    summary: runbook.summary,
    severity: runbook.severity,
    linkLabels: toArray(runbook.links).map((link) => link.label).filter(Boolean),
    sectionTitles: toArray(runbook.extraSections).map((section) => section.title).filter(Boolean),
  };
}

function getRunbookById(data, id) {
  return data.runbooks.find((item) => item.id === id) || null;
}

module.exports = {
  filterRunbooks,
  getRunbookById,
  listRunbooks,
  loadRunbookData,
  summarizeRunbook,
};
