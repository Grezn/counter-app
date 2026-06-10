const express = require("express");

const {
  JiraServiceError,
  createJiraIssue,
  getJiraStatus,
} = require("../services/jira");

const router = express.Router();

function sendJiraError(res, err, label) {
  console.error(`[Jira] ${label} error:`, err.message);

  if (err instanceof JiraServiceError) {
    return res.status(err.status).json({
      error: err.message,
      ...err.data,
    });
  }

  return res.status(500).json({
    error: err.message,
  });
}

router.get("/api/jira/status", (req, res) => {
  res.json(getJiraStatus());
});

router.post("/api/jira/issues", async (req, res) => {
  try {
    res.status(201).json(await createJiraIssue(req.body));
  } catch (err) {
    sendJiraError(res, err, "create issue");
  }
});

module.exports = router;
