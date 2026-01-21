const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// All admin routes require admin privileges

// Get admin dashboard
router.get('/dashboard',
  requireAdmin,
  asyncHandler(adminController.getDashboard)
);

// Get all users
router.get('/users',
  requireAdmin,
  asyncHandler(adminController.getAllUsers)
);

// Update user status
router.put('/users/:walletAddress',
  requireAdmin,
  asyncHandler(adminController.updateUser)
);

// Force resolve market
router.put('/markets/:marketId/resolve',
  requireAdmin,
  asyncHandler(adminController.forceResolveMarket)
);

// Get system logs
router.get('/logs',
  requireAdmin,
  asyncHandler(adminController.getSystemLogs)
);

// Get pending trades
router.get('/trades/pending',
  requireAdmin,
  asyncHandler(adminController.getPendingTrades)
);

// Update trade status
router.put('/trades/:tradeId',
  requireAdmin,
  asyncHandler(adminController.updateTradeStatus)
);

// Get platform configuration
router.get('/config',
  requireAdmin,
  asyncHandler(adminController.getConfig)
);

module.exports = router;