const express = require("express");

const {
  heartbeatVisitor,
  readVisitorStats,
  trackVisitorView,
} = require("../services/visitorStats");

// router 是 Express 的小型路由器。
// 你可以把這個檔案想成「訪客統計 API 的清單」。
const router = express.Router();

router.post(["/api/visitor-stats/views", "/track-view"], async (req, res) => {
  res.json(await trackVisitorView(req));
});

router.post(["/api/visitor-stats/heartbeat", "/heartbeat"], async (req, res) => {
  res.json(await heartbeatVisitor(req));
});

router.get(["/api/visitor-stats", "/stats"], async (req, res) => {
  res.json(await readVisitorStats());
});

module.exports = router;
