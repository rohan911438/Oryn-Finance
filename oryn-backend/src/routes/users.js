const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { userValidations } = require('../middleware/validation');
const userController = require('../controllers/userController');

// All user routes require authentication (handled in server.js)

// Get user profile
router.get('/profile',
  asyncHandler(userController.getUserProfile)
);

// Update user profile
router.put('/profile',
  userValidations.updateProfile,
  asyncHandler(userController.updateUserProfile)
);

// Get user positions
router.get('/positions',
  asyncHandler(userController.getUserPositions)
);

// Get user by wallet address (public info only)
router.get('/:walletAddress',
  asyncHandler(userController.getUserByAddress)
);

// Get user trade statistics
router.get('/stats',
  asyncHandler(userController.getUserStats)
);

module.exports = router;