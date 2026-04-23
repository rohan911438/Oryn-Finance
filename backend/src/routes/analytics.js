const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const analyticsController = require('../controllers/analyticsController');

// Get platform statistics
router.get('/stats',
  asyncHandler(analyticsController.getPlatformStats)
);

// Get market trends
router.get('/market-trends',
  asyncHandler(analyticsController.getMarketTrends)
);

router.get('/price-trends',
  asyncHandler(analyticsController.getPriceTrends)
);

// Get user activity metrics
router.get('/user-activity',
  asyncHandler(analyticsController.getUserActivity)
);

// Get detailed analytics (admin only)
router.get('/detailed',
  asyncHandler(analyticsController.getDetailedAnalytics)
);

// Get indexed blockchain events (for frontend sync/debugging)
router.get('/events',
  asyncHandler(analyticsController.getIndexedEvents)
);

router.get('/user-insights',
  asyncHandler(analyticsController.getUserInsights)
);

module.exports = router;