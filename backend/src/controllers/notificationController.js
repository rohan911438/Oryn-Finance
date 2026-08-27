const notificationService = require('../services/notificationService');
const { ForbiddenError, NotFoundError, ValidationError } = require('../middleware/errorHandler');

function assertWalletAccess(req, walletAddress) {
  const requested = String(walletAddress || '').toLowerCase();
  const authenticated = req.user?.walletAddress?.toLowerCase();

  if (!requested) {
    throw new ValidationError('walletAddress is required');
  }

  if (requested !== authenticated) {
    throw new ForbiddenError('Cannot access notifications for another wallet');
  }

  return requested;
}

class NotificationController {
  static async getPreferences(req, res) {
    const walletAddress = assertWalletAccess(req, req.params.walletAddress);
    const preferences = await notificationService.getPreferences(walletAddress);
    res.json({ success: true, data: preferences });
  }

  static async savePreferences(req, res) {
    const walletAddress = assertWalletAccess(req, req.params.walletAddress);
    const preferences = await notificationService.savePreferences(walletAddress, req.body);
    res.json({ success: true, data: preferences, message: 'Notification preferences saved' });
  }

  static async getAlerts(req, res) {
    const walletAddress = assertWalletAccess(req, req.params.walletAddress);
    const data = await notificationService.listNotifications(walletAddress, req.query);
    res.json({ success: true, data: data.notifications, pagination: data.pagination });
  }

  static async getUnreadCount(req, res) {
    const walletAddress = assertWalletAccess(req, req.params.walletAddress);
    const count = await notificationService.unreadCount(walletAddress);
    res.json({ success: true, data: { count } });
  }

  static async markAlertAsRead(req, res) {
    const notification = await notificationService.markRead(req.user.walletAddress, req.params.alertId);
    if (!notification) throw new NotFoundError('Notification');
    res.json({ success: true, data: notification });
  }

  static async markAllAlertsAsRead(req, res) {
    const modifiedCount = await notificationService.markAllRead(req.user.walletAddress);
    res.json({ success: true, data: { modifiedCount } });
  }

  static async deleteAlert(req, res) {
    const deleted = await notificationService.deleteNotification(req.user.walletAddress, req.params.alertId);
    if (!deleted) throw new NotFoundError('Notification');
    res.json({ success: true, data: { deleted: true } });
  }

  static async clearAlerts(req, res) {
    const deletedCount = await notificationService.clearNotifications(req.user.walletAddress);
    res.json({ success: true, data: { deletedCount } });
  }

  static async sendTransactionStatusAlert(req, res) {
    const { walletAddress, transactionId, status, type, amount } = req.body;
    assertWalletAccess(req, walletAddress);
    if (!transactionId || !status || !type) throw new ValidationError('transactionId, status, and type are required');

    const severity = status === 'failed' ? 'warning' : status === 'confirmed' ? 'success' : 'info';
    const result = await notificationService.createNotification({
      walletAddress,
      type: 'transaction_status',
      severity,
      title: `Transaction ${status}`,
      message: `${type} transaction ${transactionId} is ${status}${amount ? ` for ${amount}` : ''}.`,
      metadata: { transactionId, status, transactionType: type, amount }
    });
    res.status(201).json({ success: true, data: result });
  }

  static async sendPortfolioMilestoneAlert(req, res) {
    const { walletAddress, milestone, value, currentValue } = req.body;
    assertWalletAccess(req, walletAddress);
    if (!milestone || value === undefined || currentValue === undefined) throw new ValidationError('milestone, value, and currentValue are required');

    const result = await notificationService.createNotification({
      walletAddress,
      type: 'portfolio_milestone',
      severity: 'success',
      title: 'Portfolio milestone reached',
      message: `${milestone} reached. Current value: ${currentValue}; target: ${value}.`,
      metadata: { milestone, value, currentValue }
    });
    res.status(201).json({ success: true, data: result });
  }

  static async sendLiquidationWarning(req, res) {
    const { walletAddress, positionId, riskLevel, estimatedLiquidationPrice, currentPrice } = req.body;
    assertWalletAccess(req, walletAddress);
    if (!positionId || riskLevel === undefined || !estimatedLiquidationPrice || !currentPrice) {
      throw new ValidationError('positionId, riskLevel, estimatedLiquidationPrice, and currentPrice are required');
    }

    const result = await notificationService.createNotification({
      walletAddress,
      type: 'liquidation_warning',
      severity: 'critical',
      title: 'Liquidation risk warning',
      message: `Position ${positionId} has reached ${(Number(riskLevel) * 100).toFixed(0)}% risk. Current price: ${currentPrice}; estimated liquidation: ${estimatedLiquidationPrice}.`,
      metadata: { positionId, riskLevel, estimatedLiquidationPrice, currentPrice },
      force: true
    });
    res.status(201).json({ success: true, data: result });
  }

  static async sendTreasuryAlert(req, res) {
    const { walletAddress, eventType, amount, asset = 'USDC', threshold, message } = req.body;
    assertWalletAccess(req, walletAddress);
    if (!eventType) throw new ValidationError('eventType is required');

    const result = await notificationService.createNotification({
      walletAddress,
      type: 'treasury_alert',
      severity: Number(amount) >= Number(threshold || Infinity) ? 'warning' : 'info',
      title: 'Treasury alert',
      message: message || `Treasury ${eventType} event${amount ? ` for ${amount} ${asset}` : ''}.`,
      metadata: { eventType, amount, asset, threshold }
    });
    res.status(201).json({ success: true, data: result });
  }

  static async sendRiskAlert(req, res) {
    const { walletAddress, riskType, score, severity, message, metadata = {} } = req.body;
    assertWalletAccess(req, walletAddress);
    if (!riskType) throw new ValidationError('riskType is required');

    const result = await notificationService.createNotification({
      walletAddress,
      type: 'risk_alert',
      severity: severity || (Number(score) >= 80 ? 'critical' : Number(score) >= 60 ? 'warning' : 'info'),
      title: 'Risk alert',
      message: message || `${riskType} risk score changed to ${score}.`,
      metadata: { riskType, score, ...metadata }
    });
    res.status(201).json({ success: true, data: result });
  }

  static async sendYieldOpportunity(req, res) {
    const { walletAddress, marketId, question, apy, riskScore, message } = req.body;
    assertWalletAccess(req, walletAddress);
    if (!marketId || apy === undefined) throw new ValidationError('marketId and apy are required');

    const result = await notificationService.createNotification({
      walletAddress,
      type: 'yield_opportunity',
      severity: Number(riskScore) >= 70 ? 'warning' : 'info',
      title: 'Yield opportunity',
      message: message || `${question || marketId} is offering ${apy}% APY.`,
      metadata: { marketId, question, apy, riskScore }
    });
    res.status(201).json({ success: true, data: result });
  }

  static async logAlertFailure(req, res) {
    const { walletAddress, alertType, reason, metadata = {} } = req.body;
    assertWalletAccess(req, walletAddress);
    if (!alertType || !reason) throw new ValidationError('alertType and reason are required');

    const result = await notificationService.createNotification({
      walletAddress,
      type: 'system',
      severity: 'warning',
      title: 'Notification delivery issue',
      message: `${alertType} delivery failed: ${reason}`,
      metadata: { alertType, reason, ...metadata }
    });
    res.status(201).json({ success: true, data: result });
  }
}

module.exports = NotificationController;
