const express = require("express");

const { getLocalWeather } = require("../services/weather");

const router = express.Router();

router.get("/api/weather/local", async (req, res) => {
  try {
    const result = await getLocalWeather(req.query);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[Weather] local weather failed:", err.message);
    res.status(500).json({
      configured: true,
      error: err.message,
    });
  }
});

module.exports = router;
