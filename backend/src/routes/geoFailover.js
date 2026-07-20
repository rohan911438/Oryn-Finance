const express = require("express");
const router = express.Router();
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const {
  getHealthSummary,
  getBestRegion,
  getAllRegions,
  forceFailover,
} = require("../controllers/geoFailoverController");

// Public routes
router.get("/health", getHealthSummary);
router.get("/best-region", getBestRegion);
router.get("/regions", getAllRegions);

// Admin only routes
router.post("/force-failover", authenticateToken, requireAdmin, forceFailover);

module.exports = router;
