const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { tradeValidations, queryValidations } = require('../middleware/validation');
const tradeController = require('../controllers/tradeController');

// All trade routes require authentication (handled in server.js)

// Execute a trade
router.post('/',
  tradeValidations.executeTrade,
  asyncHandler(tradeController.executeTrade)
);

// Get user's trade history
router.get('/history',
  queryValidations.tradeHistory,
  asyncHandler(tradeController.getTradeHistory)
);

// Get recent trades across all markets
router.get('/recent',
  queryValidations.tradeHistory,
  asyncHandler(tradeController.getRecentTrades)
);

// Get trade by ID
router.get('/:tradeId',
  asyncHandler(tradeController.getTradeById)
);

// Calculate trade price before execution
router.post('/calculate',
  asyncHandler(tradeController.calculateTradePrice)
);

// Get pending trades for user
router.get('/pending',
  asyncHandler(tradeController.getPendingTrades)
);

module.exports = router;