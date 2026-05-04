const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const router = express.Router();
const RUNBOOKS_FILE = path.join(__dirname, "../data/runbooks.json");

function normalizeQueryText(value) {
  // 搜尋時統一轉小寫，讓使用者不用在意大小寫。
  return String(value || "").trim().toLowerCase();
}

function hasKeyword(runbook, keyword) {
  if (!keyword) return true;

  // 把一份 runbook 會被搜尋到的欄位集中成一段文字。
  // 這樣前端只要打「AWS」「交班」「報修」都能找到相關 SOP。
  const searchableText = [
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
    ])),
  ].join(" ").toLowerCase();

  return searchableText.includes(keyword);
}

async function loadRunbooks() {
  // 資料放在後端 data/runbooks.json。
  // 這裡每次 request 都重新讀檔，本機開發時改 JSON 後重新整理就看得到。
  const raw = await fs.readFile(RUNBOOKS_FILE, "utf8");
  const data = JSON.parse(raw);

  return {
    version: data.version || "unknown",
    note: data.note || "",
    categories: Array.isArray(data.categories) ? data.categories : [],
    runbooks: Array.isArray(data.runbooks) ? data.runbooks : [],
  };
}

router.get("/api/runbooks", async (req, res) => {
  try {
    const data = await loadRunbooks();
    const category = normalizeQueryText(req.query.category);
    const keyword = normalizeQueryText(req.query.q);

    const runbooks = data.runbooks.filter((runbook) => {
      const categoryMatched = !category || normalizeQueryText(runbook.category) === category;
      return categoryMatched && hasKeyword(runbook, keyword);
    });

    res.json({
      ...data,
      runbooks,
      total: data.runbooks.length,
      filtered: runbooks.length,
    });
  } catch (err) {
    console.error("[Runbooks] load failed:", err.message);
    res.status(500).json({
      error: "runbooks unavailable",
    });
  }
});

module.exports = router;
