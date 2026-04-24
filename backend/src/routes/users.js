const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { userValidations } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const userController = require('../controllers/userController');

// All user routes require authentication (handled in server.js)

// Get user profile
router.get('/profile',
  authenticateToken,
  asyncHandler(userController.getUserProfile)
);

// Update user profile
router.put('/profile',
  authenticateToken,
  userValidations.updateProfile,
  asyncHandler(userController.updateUserProfile)
);

// Get user positions
router.get('/positions',
  authenticateToken,
  asyncHandler(userController.getUserPositions)
);

// Get user trade statistics
router.get('/stats',
  authenticateToken,
  asyncHandler(userController.getUserStats)
);

// Get user reputation score and rank
router.get('/reputation',
  authenticateToken,
  asyncHandler(userController.getUserReputation)
);

// Get user by wallet address (public info only)
router.get('/:walletAddress',
  asyncHandler(userController.getUserByAddress)
);

module.exports = router;