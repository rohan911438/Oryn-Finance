jest.mock('../../src/services/pushNotificationService', () => ({
  sendToWallet: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../src/services/websocketHandler', () => ({
  sendUserNotification: jest.fn()
}));

jest.mock('../../src/config/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
}));

const notificationService = require('../../src/services/notificationService');
const pushNotificationService = require('../../src/services/pushNotificationService');
const websocketHandler = require('../../src/services/websocketHandler');

describe('NotificationService', () => {
  const walletAddress = 'GABC123';

  beforeEach(() => {
    jest.clearAllMocks();
    notificationService.resetMemoryStore();
  });

  it('returns default preferences for a new wallet', async () => {
    const preferences = await notificationService.getPreferences(walletAddress);

    expect(preferences).toMatchObject({
      transactionStatus: true,
      treasuryAlerts: true,
      riskAlerts: true,
      yieldOpportunityAlerts: true
    });
  });

  it('sanitizes preference updates and keeps liquidation warnings enabled', async () => {
    const preferences = await notificationService.savePreferences(walletAddress, {
      transactionStatus: false,
      liquidationWarnings: false,
      riskAlerts: 'yes'
    });

    expect(preferences.transactionStatus).toBe(false);
    expect(preferences.liquidationWarnings).toBe(true);
    expect(preferences.riskAlerts).toBe(true);
  });

  it('stores delivered notification history and emits live channels', async () => {
    const result = await notificationService.createNotification({
      walletAddress,
      type: 'transaction_status',
      title: 'Transaction confirmed',
      message: 'Trade tx_1 confirmed',
      severity: 'success',
      metadata: { transactionId: 'tx_1' }
    });

    const history = await notificationService.listNotifications(walletAddress);

    expect(result.success).toBe(true);
    expect(history.notifications).toHaveLength(1);
    expect(history.notifications[0]).toMatchObject({
      type: 'transaction_status',
      category: 'transaction',
      read: false
    });
    expect(websocketHandler.sendUserNotification).toHaveBeenCalledWith(
      walletAddress.toLowerCase(),
      expect.objectContaining({ type: 'transaction_status' })
    );
    expect(pushNotificationService.sendToWallet).toHaveBeenCalled();
  });

  it('suppresses disabled alert types without increasing unread badge count', async () => {
    await notificationService.savePreferences(walletAddress, { yieldOpportunityAlerts: false });

    const result = await notificationService.createNotification({
      walletAddress,
      type: 'yield_opportunity',
      title: 'Yield opportunity',
      message: 'A pool is yielding 12% APY'
    });

    const count = await notificationService.unreadCount(walletAddress);
    const history = await notificationService.listNotifications(walletAddress);

    expect(result.success).toBe(false);
    expect(result.notification.status).toBe('suppressed');
    expect(count).toBe(0);
    expect(history.notifications).toHaveLength(1);
    expect(websocketHandler.sendUserNotification).not.toHaveBeenCalled();
  });

  it('marks notifications as read and clears history', async () => {
    const first = await notificationService.createNotification({
      walletAddress,
      type: 'treasury_alert',
      title: 'Treasury alert',
      message: 'Large outflow detected'
    });
    await notificationService.createNotification({
      walletAddress,
      type: 'risk_alert',
      title: 'Risk alert',
      message: 'Risk score increased'
    });

    await notificationService.markRead(walletAddress, first.notification.id);
    expect(await notificationService.unreadCount(walletAddress)).toBe(1);

    await notificationService.markAllRead(walletAddress);
    expect(await notificationService.unreadCount(walletAddress)).toBe(0);

    expect(await notificationService.clearNotifications(walletAddress)).toBe(2);
    const history = await notificationService.listNotifications(walletAddress);
    expect(history.notifications).toHaveLength(0);
  });
});
