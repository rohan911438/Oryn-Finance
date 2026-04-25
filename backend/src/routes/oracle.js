const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const oracleHealthController = require('../controllers/oracleHealthController');

// GET /api/oracle/health
router.get('/health', asyncHandler(oracleHealthController.getOracleHealth));

module.exports = router;
