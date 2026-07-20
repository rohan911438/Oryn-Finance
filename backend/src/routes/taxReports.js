const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const {
  getGainsLosses,
  getYearlyReport,
  exportCSV,
  exportPDF,
} = require("../controllers/taxReportController");

// All routes require authentication
router.use(authenticateToken);

// Get gains/losses for a period
router.get("/gains-losses", getGainsLosses);

// Get yearly tax report
router.get("/yearly-report/:year", getYearlyReport);

// Export as CSV
router.get("/export/csv/:year", exportCSV);

// Export as PDF data
router.get("/export/pdf/:year", exportPDF);

module.exports = router;
