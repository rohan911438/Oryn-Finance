const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken } = require('../middleware/auth');
const NotificationController = require('../controllers/notificationController');

router.use(authenticateToken);

router.get('/preferences/:walletAddress', asyncHandler(NotificationController.getPreferences));
router.post('/preferences/:walletAddress', asyncHandler(NotificationController.savePreferences));

router.get('/alerts/:walletAddress', asyncHandler(NotificationController.getAlerts));
router.get('/unread-count/:walletAddress', asyncHandler(NotificationController.getUnreadCount));
router.put('/alerts/read-all', asyncHandler(NotificationController.markAllAlertsAsRead));
router.put('/alerts/:alertId/read', asyncHandler(NotificationController.markAlertAsRead));
router.delete('/alerts/:alertId', asyncHandler(NotificationController.deleteAlert));
router.delete('/alerts', asyncHandler(NotificationController.clearAlerts));

router.post('/send/transaction-status', asyncHandler(NotificationController.sendTransactionStatusAlert));
router.post('/send/portfolio-milestone', asyncHandler(NotificationController.sendPortfolioMilestoneAlert));
router.post('/send/liquidation-warning', asyncHandler(NotificationController.sendLiquidationWarning));
router.post('/send/treasury-alert', asyncHandler(NotificationController.sendTreasuryAlert));
router.post('/send/risk-alert', asyncHandler(NotificationController.sendRiskAlert));
router.post('/send/yield-opportunity', asyncHandler(NotificationController.sendYieldOpportunity));
router.post('/log-failure', asyncHandler(NotificationController.logAlertFailure));

module.exports = router;
