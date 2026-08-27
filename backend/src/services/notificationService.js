const mongoose = require('mongoose');
const logger = require('../config/logger');
const pushNotificationService = require('./pushNotificationService');
const websocketHandler = require('./websocketHandler');
const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');

const DEFAULT_PREFERENCES = Object.freeze({
  portfolioMilestones: true,
  transactionStatus: true,
  priceAlerts: true,
  liquidationWarnings: true,
  governanceUpdates: true,
  lowBalanceAlerts: true,
  marketExpired: true,
  dailyDigest: true,
  treasuryAlerts: true,
  riskAlerts: true,
  yieldOpportunityAlerts: true
});

const TYPE_TO_PREFERENCE = Object.freeze({
  transaction_status: 'transactionStatus',
  treasury_alert: 'treasuryAlerts',
  risk_alert: 'riskAlerts',
  yield_opportunity: 'yieldOpportunityAlerts',
  portfolio_milestone: 'portfolioMilestones',
  liquidation_warning: 'liquidationWarnings',
  market_expired: 'marketExpired',
  governance_update: 'governanceUpdates'
});

const TYPE_TO_CATEGORY = Object.freeze({
  transaction_status: 'transaction',
  treasury_alert: 'treasury',
  risk_alert: 'risk',
  yield_opportunity: 'yield',
  portfolio_milestone: 'portfolio',
  liquidation_warning: 'portfolio',
  market_expired: 'market',
  governance_update: 'governance',
  system: 'system'
});

class NotificationService {
  constructor() {
    this.memoryPreferences = new Map();
    this.memoryNotifications = new Map();
  }

  hasDatabase() {
    return mongoose.connection.readyState === 1;
  }

  normalizeWallet(walletAddress) {
    if (!walletAddress || typeof walletAddress !== 'string') {
      throw new Error('walletAddress is required');
    }
    return walletAddress.toLowerCase();
  }

  sanitizePreferences(preferences = {}) {
    const sanitized = { ...DEFAULT_PREFERENCES };
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (typeof preferences[key] === 'boolean') {
        sanitized[key] = preferences[key];
      }
    }
    sanitized.liquidationWarnings = true;
    return sanitized;
  }

  async getPreferences(walletAddress) {
    const wallet = this.normalizeWallet(walletAddress);

    if (!this.hasDatabase()) {
      return this.memoryPreferences.get(wallet) || { ...DEFAULT_PREFERENCES };
    }

    const stored = await NotificationPreference.findOne({ walletAddress: wallet }).lean();
    return this.sanitizePreferences(stored?.preferences);
  }

  async savePreferences(walletAddress, preferences) {
    const wallet = this.normalizeWallet(walletAddress);
    const sanitized = this.sanitizePreferences(preferences);

    if (!this.hasDatabase()) {
      this.memoryPreferences.set(wallet, sanitized);
      return sanitized;
    }

    await NotificationPreference.findOneAndUpdate(
      { walletAddress: wallet },
      { $set: { preferences: sanitized } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return sanitized;
  }

  shouldDeliver(type, preferences) {
    const preferenceKey = TYPE_TO_PREFERENCE[type];
    if (!preferenceKey) return true;
    if (type === 'liquidation_warning') return true;
    return preferences[preferenceKey] !== false;
  }

  serialize(notification) {
    const doc = typeof notification.toObject === 'function'
      ? notification.toObject({ virtuals: true })
      : notification;

    return {
      id: doc.notificationId,
      notificationId: doc.notificationId,
      type: doc.type,
      category: doc.category,
      severity: doc.severity,
      title: doc.title,
      message: doc.message,
      timestamp: (doc.createdAt || new Date()).toISOString?.() || doc.createdAt,
      read: Boolean(doc.readAt),
      readAt: doc.readAt || null,
      status: doc.status,
      metadata: doc.metadata || {},
      delivery: doc.delivery || {}
    };
  }

  async createNotification({
    walletAddress,
    type,
    title,
    message,
    severity = 'info',
    metadata = {},
    force = false
  }) {
    const wallet = this.normalizeWallet(walletAddress);
    const category = TYPE_TO_CATEGORY[type] || 'system';
    const preferences = await this.getPreferences(wallet);
    const deliver = force || this.shouldDeliver(type, preferences);
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const base = {
      notificationId,
      walletAddress: wallet,
      type,
      category,
      severity,
      title,
      message,
      status: deliver ? 'delivered' : 'suppressed',
      metadata,
      delivery: {
        inApp: deliver,
        pushAttempted: false,
        pushDelivered: false,
        failureReason: deliver ? null : 'user_disabled_preference'
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      readAt: null
    };

    let saved = base;
    if (this.hasDatabase()) {
      saved = await Notification.create(base);
    } else {
      const list = this.memoryNotifications.get(wallet) || [];
      list.unshift(base);
      this.memoryNotifications.set(wallet, list);
    }

    const serialized = this.serialize(saved);

    if (deliver) {
      websocketHandler.sendUserNotification(wallet, serialized);
      try {
        base.delivery.pushAttempted = true;
        await pushNotificationService.sendToWallet(wallet, {
          title,
          body: message,
          tag: type,
          data: { notificationId, type, category, severity, ...metadata }
        });
        base.delivery.pushDelivered = true;
      } catch (error) {
        base.delivery.failureReason = error.message;
        logger.warn('Push notification delivery failed', { walletAddress: wallet, type, error: error.message });
      }
    }

    return {
      success: deliver,
      deliveryMethod: deliver ? 'in_app' : 'suppressed',
      timestamp: serialized.timestamp,
      notification: serialized,
      error: deliver ? undefined : 'User disabled this notification type'
    };
  }

  async listNotifications(walletAddress, { limit = 50, page = 1, unreadOnly = false, category } = {}) {
    const wallet = this.normalizeWallet(walletAddress);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);

    if (!this.hasDatabase()) {
      let list = this.memoryNotifications.get(wallet) || [];
      if (unreadOnly) list = list.filter((item) => item.status === 'delivered' && !item.readAt);
      if (category) list = list.filter((item) => item.category === category);
      const start = (safePage - 1) * safeLimit;
      return {
        notifications: list.slice(start, start + safeLimit).map((item) => this.serialize(item)),
        pagination: { page: safePage, limit: safeLimit, total: list.length, pages: Math.ceil(list.length / safeLimit) }
      };
    }

    const filter = { walletAddress: wallet };
    if (unreadOnly) filter.readAt = null;
    if (category) filter.category = category;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),
      Notification.countDocuments(filter)
    ]);

    return {
      notifications: notifications.map((item) => this.serialize(item)),
      pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
    };
  }

  async unreadCount(walletAddress) {
    const wallet = this.normalizeWallet(walletAddress);

    if (!this.hasDatabase()) {
      return (this.memoryNotifications.get(wallet) || [])
        .filter((item) => item.status === 'delivered' && !item.readAt).length;
    }

    return Notification.countDocuments({ walletAddress: wallet, status: 'delivered', readAt: null });
  }

  async markRead(walletAddress, notificationId) {
    const wallet = this.normalizeWallet(walletAddress);
    const readAt = new Date();

    if (!this.hasDatabase()) {
      const list = this.memoryNotifications.get(wallet) || [];
      const notification = list.find((item) => item.notificationId === notificationId);
      if (!notification) return null;
      notification.readAt = readAt;
      return this.serialize(notification);
    }

    const notification = await Notification.findOneAndUpdate(
      { walletAddress: wallet, notificationId },
      { $set: { readAt } },
      { new: true }
    );
    return notification ? this.serialize(notification) : null;
  }

  async markAllRead(walletAddress) {
    const wallet = this.normalizeWallet(walletAddress);
    const readAt = new Date();

    if (!this.hasDatabase()) {
      const list = this.memoryNotifications.get(wallet) || [];
      let modified = 0;
      list.forEach((item) => {
        if (item.status === 'delivered' && !item.readAt) {
          item.readAt = readAt;
          modified += 1;
        }
      });
      return modified;
    }

    const result = await Notification.updateMany(
      { walletAddress: wallet, status: 'delivered', readAt: null },
      { $set: { readAt } }
    );
    return result.modifiedCount || 0;
  }

  async deleteNotification(walletAddress, notificationId) {
    const wallet = this.normalizeWallet(walletAddress);

    if (!this.hasDatabase()) {
      const list = this.memoryNotifications.get(wallet) || [];
      const next = list.filter((item) => item.notificationId !== notificationId);
      this.memoryNotifications.set(wallet, next);
      return next.length !== list.length;
    }

    const result = await Notification.deleteOne({ walletAddress: wallet, notificationId });
    return result.deletedCount === 1;
  }

  async clearNotifications(walletAddress) {
    const wallet = this.normalizeWallet(walletAddress);

    if (!this.hasDatabase()) {
      const count = (this.memoryNotifications.get(wallet) || []).length;
      this.memoryNotifications.set(wallet, []);
      return count;
    }

    const result = await Notification.deleteMany({ walletAddress: wallet });
    return result.deletedCount || 0;
  }

  resetMemoryStore() {
    this.memoryPreferences.clear();
    this.memoryNotifications.clear();
  }
}

module.exports = new NotificationService();
module.exports.DEFAULT_PREFERENCES = DEFAULT_PREFERENCES;
module.exports.TYPE_TO_PREFERENCE = TYPE_TO_PREFERENCE;
