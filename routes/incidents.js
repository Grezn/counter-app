const express = require("express");

const {
  IncidentServiceError,
  createIncidentRecord,
  deleteIncidentRecord,
  getRedisStatus,
  listIncidentRecords,
  resolveIncidentRecord,
  updateIncidentRecord,
} = require("../services/incidents");

const router = express.Router();

function sendIncidentError(res, err, label) {
  console.error(`[Incidents] ${label} failed:`, err.message);

  if (err instanceof IncidentServiceError) {
    return res.status(err.status).json({
      error: err.message,
      ...err.data,
    });
  }

  return res.status(500).json({
    error: err.message,
    redis: getRedisStatus(),
  });
}

router.get("/api/incidents", async (req, res) => {
  try {
    res.json(await listIncidentRecords(req.query));
  } catch (err) {
    sendIncidentError(res, err, "list");
  }
});

router.post("/api/incidents", async (req, res) => {
  try {
    res.status(201).json(await createIncidentRecord(req.body));
  } catch (err) {
    sendIncidentError(res, err, "create");
  }
});

router.put("/api/incidents/:id", async (req, res) => {
  try {
    res.json(await updateIncidentRecord(req.params.id, req.body));
  } catch (err) {
    sendIncidentError(res, err, "update");
  }
});

router.patch("/api/incidents/:id/resolve", async (req, res) => {
  try {
    res.json(await resolveIncidentRecord(req.params.id));
  } catch (err) {
    sendIncidentError(res, err, "resolve");
  }
});

router.delete("/api/incidents/:id", async (req, res) => {
  try {
    res.json(await deleteIncidentRecord(req.params.id));
  } catch (err) {
    sendIncidentError(res, err, "delete");
  }
});

module.exports = router;
