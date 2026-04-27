const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { marketValidations, queryValidations } = require('../middleware/validation');
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const marketController = require('../controllers/marketController');

// Public routes (no authentication required)

// Get all markets with filtering and pagination
router.get('/', 
  optionalAuth,
  queryValidations.marketFilters,
  asyncHandler(marketController.getAllMarkets)
);

// Get trending markets
router.get('/trending',
  optionalAuth,
  asyncHandler(marketController.getTrendingMarkets)
);

// Get featured markets
router.get('/featured',
  optionalAuth,
  asyncHandler(marketController.getFeaturedMarkets)
);

// Get markets by category
router.get('/category/:category',
  optionalAuth,
  queryValidations.marketFilters,
  asyncHandler(marketController.getMarketsByCategory)
);

// Get market statistics
router.get('/stats',
  asyncHandler(marketController.getMarketStats)
);

const resolutionController = require('../controllers/resolutionController');

// Get market resolution transparency data
router.get('/:id/resolution',
  optionalAuth,
  asyncHandler(resolutionController.getMarketResolution)
);

// Get specific market by ID
router.get('/:id',
  optionalAuth,
  asyncHandler(marketController.getMarketById)
);

// Get live contract data for a market
router.get('/:id/contract-data',
  optionalAuth,
  asyncHandler(marketController.getMarketContractData)
);

// Get market price history
router.get('/:id/history',
  optionalAuth,
  asyncHandler(marketController.getMarketPriceHistory)
);

// Get market trades
router.get('/:id/trades',
  optionalAuth,
  queryValidations.tradeHistory,
  asyncHandler(marketController.getMarketTrades)
);

// Protected routes (authentication required)

// Create new market
router.post('/',
  authenticateToken,
  marketValidations.createMarket,
  asyncHandler(marketController.createMarket)
);

// Update market (only creator can update)
router.put('/:id',
  authenticateToken,
  marketValidations.updateMarket,
  asyncHandler(marketController.updateMarket)
);

// Resolve market (only creator or admin can resolve)
router.put('/:id/resolve',
  authenticateToken,
  marketValidations.resolveMarket,
  asyncHandler(marketController.resolveMarket)
);

// Add liquidity to market
router.post('/:id/liquidity',
  authenticateToken,
  asyncHandler(marketController.addLiquidity)
);

// Get user's position in market
router.get('/:id/position',
  authenticateToken,
  asyncHandler(marketController.getUserPosition)
);

module.exports = router;